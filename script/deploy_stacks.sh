#!/bin/sh

# Configuration File Path
export APP_CONFIG=$1

ACCOUNT=$(cat $APP_CONFIG | jq -r '.Project.Account') #ex> 123456789123
REGION=$(cat $APP_CONFIG | jq -r '.Project.Region') #ex> us-east-1
PROJECT_NAME=$(cat $APP_CONFIG | jq -r '.Project.Name') #ex> IoTData
PROJECT_STAGE=$(cat $APP_CONFIG | jq -r '.Project.Stage') #ex> Dev
PROFILE_NAME=$(cat $APP_CONFIG | jq -r '.Project.Profile') #ex> cdk-demo
PROJECT_PREFIX=$PROJECT_NAME$PROJECT_STAGE

echo ==--------ConfigInfo---------==
echo $APP_CONFIG
echo $PROJECT_PREFIX
# echo $ACCOUNT
echo $REGION
ech