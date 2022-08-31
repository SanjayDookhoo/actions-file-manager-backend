import AWS from 'aws-sdk';

const { S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT } = process.env;

const s3 = new AWS.S3({
	accessKeyId: S3_ACCESS_KEY_ID,
	secretAccessKey: S3_SECRET_ACCESS_KEY,
	endpoint: S3_ENDPOINT,
	// s3ForcePathStyle: true,
	signatureVersion: 'v4',
});

export default s3;
