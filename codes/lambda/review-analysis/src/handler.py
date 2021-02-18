import os
import json
from decimal import Decimal
import boto3
from botocore.exceptions import ClientError


_stream_name = os.environ.get('STREAM_NAME', 'ReviewServiceDev-ReviewAnalysisStack-Stream')
_stream_batch_size = int(os.environ.get('STREAM_BATCH_SIZE', '10'))

_comp = None
_kinesis = None


def get_comprehend():
    global _comp
    if _comp is None:
        _comp = boto3.client('comprehend')
    return _comp


def get_kinesis():
    global _kinesis
    if _kinesis is None:
        _kinesis = boto3.client('kinesis')
    return _kinesis


def batch_detect(batch_array: list):
    reviews = [item['Review'] for item in batch_array]
    
    try:
        comp = get_comprehend()
        response_entities = comp.batch_detect_entities(
                    TextList=reviews,
                    LanguageCode='en'
                )
        response_syntax = comp.batch_detect_syntax(
                    TextList=reviews,
                    LanguageCode='en