#!/bin/sh

# Configuration File Path
export APP_CONFIG=$1

ACCOUNT=$(cat $APP_CONFIG | jq -r