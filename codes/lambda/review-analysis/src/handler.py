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
        _kinesis = boto3.clien