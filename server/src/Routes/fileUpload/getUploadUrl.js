import s3 from '../../s3.js';

const { S3_BUCKET } = process.env;

const getUploadUrl = async (req, res) => {
	const { storedName, partNumber, uploadId } = req.query;

	let params = {
		Bucket: S3_BUCKET,
		Key: storedName,
		PartNumber: partNumber,
		UploadId: uploadId,
	};
	let presignedUrl = s3.getSignedUrl('uploadPart', params);
	res.send({ presignedUrl });
};

export default getUploadUrl;
