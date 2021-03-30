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
import { StackCo