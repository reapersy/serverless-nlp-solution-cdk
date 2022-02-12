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
        ClientId=user_pool
    )
    print('IdToken', response['AuthenticationResult']['IdToken'])
    return response['AuthenticationResult']['IdToken']


def request_post(apigateway_url: str, token: str, payload: dict):
    headers = {
        'content-type': "application/json", 
        'Authorization': 'Bearer ' + token
        }
    response = requests.request("POST", apigateway_url, data=json.dumps(payload), headers=headers)
    print('response===>', response)
    

def request_small_set(url: str, token: str, input_path: str, count):
    with open(input_path) as f:
        lines = f.readlines()
        for index, line in enumerate(lines):
            line = line.strip()
            print(index, line)
            
            request_post(url, token, {
                'Action': 'write',
                'ProductId': 'id-001',
                'Review': line
            })
            
          