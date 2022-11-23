import s3 from '../../s3';
import { throwErr } from '../../utils';

const { S3_BUCKET } = process.env;

const startUpload = async (req, res) => {
	const { storedName, type } = req.query;
	let params, objectExists;

	try {
		// params = {
		// 	Bucket: S3_BUCKET,
		// 	Key: storedName,
		// };
		// await s3.headObject(params).promise();

		// headObject does not work for some reason, presumably, access needs to be granted specifically for that, since it cant be anonymouse like getObject
		// therefore getObject with the smallest range possible
		params = {
			Bucket: S3_BUCKET,
			Key: storedName,
			Range: 'bytes=0-0', // example Range: 'bytes=0-1024' https://aws.plainenglish.io/optimize-your-aws-s3-performance-27b057f231a3
		};
		await s3.getObject(params).promise();

		objectExists = true;
	} catch (e) {
		objectExists = false;
	}

	if (objectExists) {
		throw throwErr('storedName already exists');
	}

	params = {
		Bucket: S3_BUCKET,
		Key: storedName,
		ContentType: type,
	};
	let uploadData = await s3.createMultipartUpload(params).promise();
	res.send({ uploadId: uploadData.UploadId });
};

export default startUpload;
