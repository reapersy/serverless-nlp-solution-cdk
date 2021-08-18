#!/bin/sh

# Configuration File Path
export APP_CONFIG=$1

echo ==--------CheckDedendencies---------==
aws --version
npm --version
cdk --version
jq --version
pip3 --version

ACCOUNT=$(cat $APP_CONFIG | jq -r