
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEvent from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kinesis from 'aws-cdk-lib/aws-kinesis';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as glue from '@aws-cdk/aws-glue-alpha';
import { NagSuppressions } from 'cdk-nag'

import { DynamoDBStreamsToLambda } from '@aws-solutions-constructs/aws-dynamodbstreams-lambda';
import { KinesisStreamsToKinesisFirehoseToS3 } from '@aws-solutions-constructs/aws-kinesisstreams-kinesisfirehose-s3';

import * as base from '../../lib/template/stack/base/base-stack';
import { AppContext } from '../../lib/template/app-context';
import { StackConfig } from '../../lib/template/app-config';


interface LambdaConfig {
    LambdaFuncName: string;
    LambdaFuncMemory: number;
    LambdaFuncCode: string;
    LambdaFuncHandler: string;
    LambdaFuncBatch: number;
    LambdaFuncWindow: number;
    StreamBatchSize: string;
}

interface KinesisConfig {
    KinesisStreamName: string;
    KinesisFireHoseName: string;
    KinesisBucketName: string;
}

interface GlueConfig {
    GlueDatabaseName: string;
    GlueTableName: string;
}

interface AthenaConfig {
    AtheanGroupName: string;
    AtheanBucketName: string;
    AtheanQuerySentiment: string;
    AtheanQueryEntities: string;
    AtheanQuerySyntax: string;
}

export interface ReviewAnalysisStackConfig extends StackConfig {
    LambdaConfig: LambdaConfig;
    KinesisConfig: KinesisConfig;
    GlueConfig: GlueConfig;
    AthenaConfig: AthenaConfig;
}

export class ReviewAnalysisStack extends base.BaseStack {

    constructor(appContext: AppContext, stackConfig: ReviewAnalysisStackConfig) {
        super(appContext, stackConfig);

        const ddbConfig = this.commonProps.appConfig.Stack.ReviewBackend.DdbConfig;
        const backendTableName: string = ddbConfig.DdbTableName;
        const backendTablePartitionKey: string = ddbConfig.DdbTablePartitionKey;
        const backendTableSortKey: string = ddbConfig.DdbTableSortKey;

        const kinesisBucket = this.createSecureS3Bucket({
            bucketId: 'kinesis-bucket',
            serverAccessLogsBucket: this.createSecureS3Bucket({bucketId: 'kinesis-access'})
        })

        const glueDatabase = new glue.Database(this, 'review-database', {
            databaseName: this.withStackName(stackConfig.GlueConfig.GlueDatabaseName).toLowerCase(),
        });

        const glueTable = new glue.Table(this, 'comprehend-table', {
            database: glueDatabase,
            tableName: this.withStackName(stackConfig.GlueConfig.GlueTableName).toLowerCase(),
            dataFormat: glue.DataFormat.PARQUET,
            bucket: kinesisBucket,
            columns: this.loadTableSchemaColumns(backendTablePartitionKey, backendTableSortKey)
        });

        const kinesisPipeline = this.createKinesisPipeline(stackConfig.KinesisConfig, kinesisBucket, glueDatabase, glueTable);

        this.createDdbToLambda(stackConfig.LambdaConfig, backendTableName, kinesisPipeline);

        const athenaBucket = this.createAthenaResources(stackConfig.AthenaConfig, glueDatabase, glueTable, backendTablePartitionKey, backendTableSortKey);

        this.createQuickSightRole([
            kinesisBucket, athenaBucket
        ]);

        this.nagSuppress();
    }

    private createKinesisPipeline(config: KinesisConfig, kinesisBucket: s3.Bucket, glueDatabase: glue.Database, glueTable: glue.Table) {
        const pipeline = new KinesisStreamsToKinesisFirehoseToS3(this, 'stream-firehose-s3', {
            kinesisStreamProps: {
                streamName: this.withStackName(config.KinesisStreamName),
                encryption: kinesis.StreamEncryption.MANAGED
            },
            kinesisFirehoseProps: {
                deliveryStreamType: 'KinesisStreamAsSource',
                deliveryStreamName: this.withStackName(config.KinesisFireHoseName),
                extendedS3DestinationConfiguration: {
                    bucketArn: kinesisBucket.bucketArn,
                    compressionFormat: 'UNCOMPRESSED',
                    bufferingHints: {
                        sizeInMBs: 64,
                        intervalInSeconds: 60
                    },
                    dataFormatConversionConfiguration: {
                        enabled: true,
                        inputFormatConfiguration: {
                            deserializer: {  openXJsonSerDe: {} }
                        },
                        outputFormatConfiguration: {
                            serializer: {  parquetSerDe: {} }
                        },
                        schemaConfiguration: {
                            region: this.commonProps.appConfig.Project.Region,
                            roleArn: this.createFireHoseRole().roleArn,
                            versionId: 'LATEST',
                            databaseName: glueDatabase.databaseName,
                            tableName: glueTable.tableName
                        },
                    }
                }
            },
            existingBucketObj: kinesisBucket,
        });

        this.putParameter(`${config.KinesisStreamName}StreamName`, pipeline.kinesisStream.streamName);
        this.putParameter(`${config.KinesisFireHoseName}HoseName`, pipeline.kinesisFirehose.deliveryStreamName!);

        return pipeline;
    }

    private createDdbToLambda(config: LambdaConfig, backendTableName: string, kinesisPipeline: KinesisStreamsToKinesisFirehoseToS3) {
        const backendTableArn = this.getParameter(`${backendTableName}TableArn`);
        const backendTableStreamArn = this.getParameter(`${backendTableName}TableStreamArn`);
        const backendTable = ddb.Table.fromTableAttributes(this, 'backend-table', {
            tableArn: backendTableArn,
            tableStreamArn: backendTableStreamArn
        });

        const streamLambda = new DynamoDBStreamsToLambda(this, 'dynamodbstreams-lambda', {
            existingTableInterface: backendTable,
            lambdaFunctionProps: {
                functionName: this.withStackName(config.LambdaFuncName),
                runtime: lambda.Runtime.PYTHON_3_9,
                code: lambda.Code.fromAsset(config.LambdaFuncCode),
                handler: config.LambdaFuncHandler,
                memorySize: config.LambdaFuncMemory,
                environment: {
                    STREAM_NAME: kinesisPipeline.kinesisStream.streamName,
                    STREAM_BATCH_SIZE: config.StreamBatchSize
                },
                deadLetterQueue: new sqs.Queue(this, 'stream-lambda-dlq', {encryption: sqs.QueueEncryption.KMS_MANAGED}),
            },
            dynamoEventSourceProps: {
                startingPosition: lambda.StartingPosition.LATEST,
                batchSize: config.LambdaFuncBatch,
                maxBatchingWindow: cdk.Duration.minutes(config.LambdaFuncWindow),
                onFailure: new lambdaEvent.SqsDlq(new sqs.Queue(this, 'sqs-dlq', {encryption: sqs.QueueEncryption.KMS_MANAGED})),
            }
        });
        kinesisPipeline.kinesisStream.grantWrite(streamLambda.lambdaFunction);
        streamLambda.lambdaFunction.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            resources: ['*'],
            actions: ['comprehend:BatchDetectEntities', 'comprehend:BatchDetectSyntax'],
        }));

        this.putParameter(`${config.LambdaFuncName}FunctionArn`, streamLambda.lambdaFunction.functionArn);
    }

    private createAthenaResources(cofig: AthenaConfig, glueDatabase: glue.Database, glueTable: glue.Table, backendTablePartitionKey: string, backendTableSortKey: string): s3.Bucket {
        const athenaBucket = this.createSecureS3Bucket({
            bucketId: 'athena-bucket',
            serverAccessLogsBucket: this.createSecureS3Bucket({bucketId: 'athena-access'})
        });

        const athenaWorkGroup = new athena.CfnWorkGroup(this, 'athena-wg', {
            name: this.withStackName(cofig.AtheanGroupName).toLowerCase(),
            workGroupConfiguration: {
                resultConfiguration: {
                    outputLocation: `s3://${athenaBucket.bucketName}/query/`
                }
            }
        });

        this.createAthenaQueriesSentiment(cofig, athenaWorkGroup, glueDatabase, glueTable, backendTablePartitionKey, backendTableSortKey);
        this.createAthenaQueriesEntities(cofig, athenaWorkGroup, glueDatabase, glueTable, backendTablePartitionKey, backendTableSortKey);
        this.createAthenaQueriesSyntax(cofig, athenaWorkGroup, glueDatabase, glueTable, backendTablePartitionKey, backendTableSortKey);

        return athenaBucket;
    }

    private createQuickSightRole(bucketList: s3.Bucket[]) {
        const quicksightRole = new iam.Role(this, 'quicksight-role', {
            assumedBy: new iam.ServicePrincipal('quicksight.amazonaws.com'),
        });
        this.exportOutput('QuickSightRole', quicksightRole.roleName);

        quicksightRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                'iam:List*',
            ],
            resources: [
                '*'
            ],
        }));
        quicksightRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                's3:ListAllMyBuckets',
            ],
            resources: [
                'arn:aws:s3:::*'
            ],
        }));
        quicksightRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                's3:ListBucket',
                's3:ListBucketMultipartUploads',
                's3:GetBucketLocation',
            ],
            resources: bucketList.map(bucket => bucket.bucketArn)
        }));
        quicksightRole.addToPrincipalPolicy(new iam.PolicyStatement({
            actions: [
                's3:GetObject',
                's3:GetObjectVersion',
                's3:PutObject',
                's3:AbortMultipartUpload',
                's3:ListMultipartUploadParts',
            ],
            resources: bucketList.map(bucket => bucket.bucketArn + '/*')
        }));
        quicksightRole.addManagedPolicy(iam.ManagedPolicy.fromManagedPolicyArn(this, 'AWSQuicksightAthenaAccess', 'arn:aws:iam::aws:policy/service-role/AWSQuicksightAthenaAccess'));
    }

    private createFireHoseRole(): iam.Role {
        const hoseRole = new iam.Role(this, 'host-role', {
            assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
        });
        hoseRole.addManagedPolicy({ managedPolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole' });
        hoseRole.addManagedPolicy({ managedPolicyArn: 'arn:aws:iam::aws:policy/AWSLambda_FullAccess' });