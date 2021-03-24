
import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEvent from 'aws-cdk-lib/aws-lambda-event-sources';
import * as ddb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as kds from 'aws-cdk-lib/aws-kinesis';
import * as kfh from 'aws-cdk-lib/aws-kinesisfirehose';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as glue from '@aws-cdk/aws-glue-alpha';

import * as base from '../../lib/template/stack/base/base-stack';
import { AppContext } from '../../lib/template/app-context';
import { StackConfig } from '../../lib/template/app-config';


interface AllInOneStackProps {
    ApiGatewayName: string;
    ReviewBackendLambdaName: string;
    ReviewHistoryTableName: string;

    ReviewAnalysisLambdaName: string;
    ReviewEntitiesTableName: string;
    ReviewSyntaxTableName: string;
    TemplateFile: string;
}

export class AllInOneStack extends base.BaseStack {
    readonly props: AllInOneStackProps;

    constructor(appContext: AppContext, stackConfig: StackConfig) {
        super(appContext, stackConfig);

        this.props = stackConfig.Props as AllInOneStackProps;

        // S3 Bucket
        const analysisBucket = new s3.Bucket(this, 'analysis-bucket', {
            encryption: s3.BucketEncryption.S3_MANAGED
        });
        const athenaBucket = new s3.Bucket(this, 'athena-bucket', {
            encryption: s3.BucketEncryption.S3_MANAGED
        });

        // Kinesis
        const stream = new kds.Stream(this, 'analysis-stream', {
            encryption: kds.StreamEncryption.KMS
        })

        // Database
        const historyTable = new ddb.Table(this, 'review-history-table', {
            tableName: `${this.projectPrefix}-${this.props.ReviewHistoryTableName}`,
            partitionKey: {
                name: 'id',
                type: ddb.AttributeType.STRING
            },
            sortKey: {
                name: 'ts',
                type: ddb.AttributeType.STRING
            },
            stream: ddb.StreamViewType.NEW_IMAGE
        });

        // Lambda
        const backendFunc = new lambda.Function(this, 'review-backend', {
            functionName: `${this.projectPrefix}-${this.props.ReviewBackendLambdaName}`,
            runtime: lambda.Runtime.PYTHON_3_9,
            code: lambda.Code.fromAsset('codes/lambda/review-backend/src'),
            handler: 'handler.handle',
            environment: {
                TABLE_NAME: historyTable.tableName
            }
        })
        historyTable.grantWriteData(backendFunc);
        backendFunc.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            resources: ['*'],
            actions: ['comprehend:DetectSentiment'],
        }));

        const analysisFunc = new lambda.Function(this, 'review-analysis', {
            functionName: `${this.projectPrefix}-${this.props.ReviewAnalysisLambdaName}`,
            runtime: lambda.Runtime.PYTHON_3_9,
            code: lambda.Code.fromAsset('codes/lambda/review-analysis/src'),
            handler: 'handler.handle',
            environment: {
                STREAM_NAME: stream.streamName
            }
        })
        stream.grantWrite(analysisFunc);
        analysisFunc.role?.addToPrincipalPolicy(new iam.PolicyStatement({
            resources: ['*'],
            actions: ['comprehend:BatchDetectEntities', 'comprehend:BatchDetectSyntax'],
        }));
        analysisFunc.addEventSource(new lambdaEvent.DynamoEventSource(historyTable, {
            startingPosition: lambda.StartingPosition.LATEST,
            batchSize: 10,
            maxBatchingWindow: cdk.Duration.minutes(1),
            bisectBatchOnError: true,
            onFailure: new lambdaEvent.SqsDlq(new sqs.Queue(this, 'sqs-dlq')),
        }));


        // API Gateway
        const api = new apigateway.LambdaRestApi(this, 'rest-api', {
            restApiName: `${this.projectPrefix}-${this.props.ApiGatewayName}`,
            handler: backendFunc,
            proxy: false
        });
        const nlpResource = api.root.addResource('review');
        nlpResource.addMethod('POST', new apigateway.LambdaIntegration(backendFunc));
