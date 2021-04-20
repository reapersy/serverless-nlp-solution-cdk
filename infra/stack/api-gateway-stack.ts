import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag'

import { wrapManagedRuleSet } from "@aws-solutions-constructs/core";
import { WafwebaclToApiGateway } from "@aws-solutions-constructs/aws-wafwebacl-apigateway";
import { CognitoToApiGatewayToLambda } from "@aws-solutions-constructs/aws-cognito-apigateway-lambda";

import * as base from '../../lib/template/stack/base/base-stack';
import { AppContext } from '../../lib/template/app-context';
import { StackConfig } from '../../lib/template/app-config';


interface ResourceMapping {
    ResourceName: string;
    LambdaFuncName: string;
    Methods: string[];
}

interface ApiConfig {
    ApiGatewayName: string;
    ResourceMapping: ResourceMapping[];
}

interface CognitoConfig {
    CognitoUserPoolName: string;
}

interface WafConfig {
    WebAclName: string;
    WafAwsManagedRules: string[];
}

export interface ApiGatewayStackConfig extends StackConfig {
    ApiConfig: ApiConfig;
    CognitoConfig: CognitoConfig;
    WafConfig: WafConfig;
}

export class ApiGatewayStack extends base.BaseStack {
    private credentialRole: iam.Role;

    constructor(appContext: AppContext, stackConfig: ApiGatewayStackConfig) {
        super(appContext, stackConfig);

        const apiConfig = stackConfig.ApiConfig;
        const cognitoConfig = stackConfig.CognitoConfig;
        const wafConfig = stackConfig.WafConfig;

        const apiLambda = new CognitoToApiGatewayToLambda(this, 'apigateway-cognito-lambda', {
            apiGatewayProps: {
                restApiName: this.withStackName(apiConfig.ApiGatewayName),
                endpointConfiguration: {
                    types: [apigateway.EndpointType.REGIONAL]
                },
                proxy: false,
                deployOptions: {
                    loggingLevel: apigateway.MethodLoggingLevel.ERROR,
                },
            },
            cognitoUserPoolProps: {
                userPoolName: this.withStackName(cognitoConfig.CognitoUserPoolName),
                passwordPolicy: {
                    requireSymbols: true,
                    minLength: 8,
                    requireUppercase: true,
                    requireDigits: true
                }
            },
            cognitoUserPoolClientProps: {
                authFlows: {
                    userPassword: true,
                    userSrp: true,
                    custom: true,
                }
            },
            existingLambdaObj: this.createDefaultHandler()
        });

        new WafwebaclToApiGateway(this, 'wafwebacl-apigateway', {
            existingApiGatewayInterface: apiLambda.apiGateway,
            webaclProps: this.createWafwebaclProps('REGIONAL', wafConfig.WafAwsManagedRules)
        });

        apiConfig.ResourceMapping.forEach(item => {
            const resource = apiLambda.apiGateway.root.addResource(item.ResourceName);
            this.addCorsOptions(resource);

            const lambdaFuncArn = this.getParameter(`${item.LambdaFuncName}FunctionArn`);
            const lambdaFunc = lambda.Function.fromFunctionArn(this, item.LambdaFuncName, lambdaFuncArn);
            const lambdaFuncIntegration = new apigateway.LambdaIntegration(lambdaFunc, {
                credentialsRole: this.getCredentialRole(item.LambdaFuncName, lambdaFuncArn)
            });
            for (let method of item.Methods) {
                resource.addMethod(method, lambdaFuncIntegration, {
                    requestValidatorOptions: {validateRequestParameters: true} });
            }
        });
        apiLambda.addAuthorizers();

        this.putParameter('RestApiName', apiLambda.apiGateway.restApiName);
        this.putParameter('UserPoolId', apiLambda.userPool.userPoolId);
        this.putParameter('UserPoolClientId', apiLambda.userPoolClient.userPoolClientId);

        this.exportOutput('RestApiUrl', apiLambda.apiGateway.url);
        this.exportOutput('UserPoolId', apiLambda.userPool.userPoolId);
        this.exportOutput('UserPoolClientId', apiLambda.userPoolClient.userPoolClientId);

        this.nagSuppressCOG2(apiLambda.userPool);
        this.nagSuppressIAM5(apiLambda.apiGatewayCloudWatchRole!);
    }

    private getCredentialRole(funcName: string, funcArn: string) {
        if (this.credentialRole == undefined) {
            this.credentialRole = new iam.Role(this, `integration-role`, {
                roleName: this.withStackName('GatewayIntegrationRole'),
                assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
            });
        }
        this.credentialRole.attachInlinePolicy(new iam.Policy(this, `${funcName}-integration-role-policy`, {
            statements: [
                new iam.PolicyStatement({
                    effect: iam.Effect.ALLOW,
                    actions: ['lambda:InvokeFunction'],
                    resources: [funcArn],
                })
            ]
        }));
        return this.credentialRole;
    }

    private createDefaultHandler(): lambda.Function {
        const role = new iam.Role(this, 'default-func-role', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });

        const lambdaFunc = new lambda.Function(this, 'default-func', {
            functionName: this.withStackName('DefaultFunc'),
            runtime: lambda.Runtime.PYTHON_3_9,
            handler: 'index.handle',
            code: lambda.Code.fromInline(`
import json
def handle(event, context):
    body_dict = {
        'Status': 'fail',
        'Message': 'not-defined resource'
    }

    return {
    