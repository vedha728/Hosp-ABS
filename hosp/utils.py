from django.core import signing

def generate_verification_token(email):
    return signing.dumps(email, salt='email-verification')

def verify_verification_token(token, max_age=86400):  # 24 hours token validity
    try:
        email = signing.loads(token, salt='email-verification', max_age=max_age)
        return email
    except signing.SignatureExpired:
        return None
