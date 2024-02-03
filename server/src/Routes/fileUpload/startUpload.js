import s3 from '../../s3.js';
import { throwErr } from '../../utils.js';

const { S3_BUCKET } = process.env;

const startUpload = async (req, res) => {
	const { storedName, type } = req.query;
	let params, objectExists;

	try {
		params = {
			Bucket: S3_BUCKET,
			Key: storedName,
		};
		await s3.headObject(params).promise();

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
