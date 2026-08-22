/**
 * Runs before each test file.
 * Provides the minimum env variables required by env/index.ts Zod validation
 * so services can be imported without a real .env file.
 */

// Must be set BEFORE any module is imported (Jest executes setupFiles early)
process.env.NODE_ENV = 'testing'
process.env.INFRA_PROVIDER = 'gcp'

// Required by infraEnvSchema() — GCP adapter
process.env.FIREBASE_PROJECT_ID = 'test-project'
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com'
process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA0Z3VS5JJcds3xHn/ygWep4PAtFOFBkAH3B7TlYRSvbOelDFB\naKGgOBOJRuP/zQzKaYVIqkuG6BVKEFXC7P3A8bBOvkAz//example//key==\n-----END RSA PRIVATE KEY-----\n'
process.env.FIREBASE_DEFAULT_DATABASE_URL = 'https://test-project-default-rtdb.firebaseio.com'
process.env.FIREBASE_STORAGE_BUCKET = 'test-project.appspot.com'

// Required by core env schema — Firebase client SDK
process.env.FIREBASE_API_KEY = 'test-api-key'
process.env.FIREBASE_AUTH_DOMAIN = 'test-project.firebaseapp.com'
process.env.FIREBASE_MESSAGING_SENDER_ID = '123456789'
process.env.FIREBASE_APP_ID = '1:123456789:web:abc123'
process.env.FIREBASE_HOSTING_URL = 'https://test-project.web.app'

// AWS (required when isGcp())
process.env.AWS_ACCESS_KEY_ID = 'test-access-key'
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key'
process.env.AWS_REGION = 'us-east-1'
process.env.AWS_HOSTED_ZONE_ID = 'Z1234567890'

// Core services
process.env.CORE_API_KEY = 'test-core-api-key'
process.env.ENGINE_URL = 'http://localhost:4000'
process.env.INTEGRATION_URL = 'http://localhost:4001'
process.env.INTERVIEW_BASE_URL = 'https://interview.test'

// Silence verbose service-level logs during Jest runs to keep CI output readable.
console.log = (..._args: unknown[]) => undefined
