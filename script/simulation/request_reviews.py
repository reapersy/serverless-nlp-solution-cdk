import os
import time
import argparse
import json
import requests
import pandas as pd
import boto3


'''
How to execute: python3 script/simulation/request_reviews.py --profile [aws profile name] --url [APIGatewaty URL + /review] --pool [cognito user pool client id] --id [new user id] --pw [new user pw]
'''


def login(user_pool, username, password) -> str:
    client = boto3.client('cognito-idp')
    response = client.initiate_auth(
        AuthFlow='USER_PASSWORD_AUTH',
        AuthParameters={
            'USERNAME': username,
            'PASSWORD': password
        },
    