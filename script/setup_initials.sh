#!/bin/sh

# Configuration File Path
export APP_CONFIG=$1

echo ==--------CheckDedendencies---------==
aws --version
npm --version
cdk --version
jq --version
pip3 --version

ACCOUNT=$(cat $APP_CONFIG | jq -r '.Project.Account') #ex> 123456789123
REGION=$(cat $APP_CONFIG | jq -r '.Project.Region') #ex> us-east-1
PROFILE_NAME=$(cat $APP_CONFIG | jq -r '.Project.Profile') #ex> cdk-demo


echo ==--------ConfigInfo---------==
echo $APP_CONFIG
# echo $ACCOUNT
echo $REGION
echo $PROFILE_NAME
if [ -z "$PROFILE_NAME" ]; then
    echo "Project.Profile is empty, default AWS Profile is used"
else
    if [ -z "$ON_PIPELINE" ]; then
        echo "$PROFI