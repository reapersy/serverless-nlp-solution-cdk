
import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { NagSuppressions } from 'cdk-nag'

import * as base from '../../lib/template/stack/base/base-stack';
import { AppContext } from '../../lib/template/app-context';
import { CloudWatchSimplePattern } from '../../lib/template/construct/pattern/cloudwatch-simple-pattern'


export enum ApiGatewayAlarmType {
    OverallCall,
    Error4xxCall,
    Error5xxCall,
}

export interface ApiGatewayAlarmProps {
    alarmType: ApiGatewayAlarmType;
    alarmThreshold: number;
    subscriptionEmails: string[];
}

export interface RestApisWidgetProps {
    widgetName: string;
    restApisName: string;
    alarms?: ApiGatewayAlarmProps[];
}

export class ReviewDashboardStack extends base.BaseStack {
    private readonly dashboard: CloudWatchSimplePattern;

    constructor(appContext: AppContext, stackConfig: any) {
        super(appContext, stackConfig);

        const dashboardName = this.stackConfig.DashboardName;
        this.dashboard = new CloudWatchSimplePattern(this, dashboardName, {
            stackName: this.stackName,
            projectPrefix: this.projectPrefix,
            env: this.commonProps.env!,
            stackConfig: stackConfig,
            variables: this.commonProps.variables,

            dashboardName: dashboardName,
            commonPeriod: cdk.Duration.minutes(1)
        });
        
        const userPoolIdToken = this.getParameter('UserPoolId');
        const userPoolClientIdToken = this.getParameter('UserPoolClientId');
        this.createCognitoWidget('Cognito', userPoolIdToken, userPoolClientIdToken);
        
        const restApisName = this.getParameter('RestApiName');
        this.createApiGatewayWidget('APIGateway', restApisName);
        
        const backendFuncName = 'BackendFunc';
        const backendTableName = 'ReviewHistoryTable';
        const backendFuncArnToken = this.getParameter(`${backendFuncName}FunctionArn`);
        const backendTableNameToken = this.getParameter(`${backendTableName}TableName`);
        this.createBackendWidget('Backend', backendFuncArnToken, backendTableNameToken);

        const analysisFuncName = 'AnalysisFunc';
        const streamName = 'Stream';
        const hoseName = 'Hose';
        const analysisFuncArnToken = this.getParameter(`${analysisFuncName}FunctionArn`);
        const analysisStreamNameToken = this.getParameter(`${streamName}StreamName`);
        const analysisHostNameToken = this.getParameter(`${hoseName}HoseName`);
        this.createAnalysisWidget('Analysis', analysisFuncArnToken, analysisStreamNameToken, analysisHostNameToken);

        this.nagSuppress();
    }

    private createApiGatewayWidget(baseName: string, restApisName: string) {
        const countMetric = this.dashboard.createApiGatewayMetric(restApisName, 'Count', { statistic: 'Sum', unit: cloudwatch.Unit.COUNT });
        const error4xxMetric = this.dashboard.createApiGatewayMetric(restApisName, '4XXError', { statistic: 'Sum', unit: cloudwatch.Unit.COUNT });
        const error5xxMetric = this.dashboard.createApiGatewayMetric(restApisName, '5XXError', { statistic: 'Sum', unit: cloudwatch.Unit.COUNT });

        const latencyMetric = this.dashboard.createApiGatewayMetric(restApisName, 'Latency', { statistic: 'Average', unit: cloudwatch.Unit.MILLISECONDS });
        const IntegrationLatencyMetric = this.dashboard.createApiGatewayMetric(restApisName, 'IntegrationLatency', { statistic: 'Average', unit: cloudwatch.Unit.MILLISECONDS });

        this.dashboard.addTextTitleWidges(`## ${baseName} Dashboard`)

        this.dashboard.addWidgets(new cloudwatch.SingleValueWidget({
            title: `${baseName}-Count`,
            metrics: [countMetric, error4xxMetric, error5xxMetric],
            width: 24,
            height: 3
        }));

        this.dashboard.addWidgets(
            this.dashboard.createWidget(`${baseName}-Latency`, [latencyMetric, IntegrationLatencyMetric], 24)
        );

        this.createWidgetAlarmAction(`${baseName}-OverallCall`, countMetric, {
            alarmType: ApiGatewayAlarmType.OverallCall,
            alarmThreshold: this.stackConfig.ApiGatewayOverallCallThreshold,
            subscriptionEmails: this.stackConfig.SubscriptionEmails,
        }, 3, 24);

        this.createWidgetAlarmAction(`${baseName}-Error4xxCall`, error4xxMetric, {
            alarmType: ApiGatewayAlarmType.Error4xxCall,
            alarmThreshold: this.stackConfig.ApiGatewayError4xxCallThreshold,
            subscriptionEmails: this.stackConfig.SubscriptionEmails,
        }, 3, 24);

        this.createWidgetAlarmAction(`${baseName}-Error5xxCall`, error5xxMetric, {
            alarmType: ApiGatewayAlarmType.Error5xxCall,
            alarmThreshold: this.stackConfig.ApiGatewayError5xxCallThreshold,
            subscriptionEmails: this.stackConfig.SubscriptionEmails,
        }, 3, 24);
    }

    private createBackendWidget(baseName: string, functionArn: string, tableName: string) {
        this.dashboard.addTextTitleWidges(`## ${baseName} Dashboard`)

        this.createLambdaWidget(`${baseName}Function`, functionArn);
        this.addDdbWidgets(`${baseName}Table`, tableName);