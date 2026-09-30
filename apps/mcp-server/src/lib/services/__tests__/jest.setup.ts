// Set required environment variables before any module is loaded
process.env.NODE_ENV = 'testing'
process.env.INFRA_PROVIDER = 'gcp'
process.env.FIREBASE_PROJECT_ID = 'test-project'
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com'
process.env.FIREBASE_PRIVATE_KEY =
	'-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4s...\n-----END RSA PRIVATE KEY-----\n'
process.env.FIREBASE_DEFAULT_DATABASE_URL = 'https://test-project.firebaseio.com'
process.env.FIREBASE_STORAGE_BUCKET = 'test-project.appspot.com'
process.env.GCP_PROJECT_ID = 'test-project'
process.env.INTERVIEW_BASE_URL = 'https://interview.coploy.io'
