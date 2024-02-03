import sharp from 'sharp';
import { upload } from '../../index.js';
import s3 from '../../s3.js';
import stream from 'stream';

const { S3_BUCKET } = process.env;

// https://stackoverflow.com/questions/37336050/pipe-a-stream-to-s3-upload
const uploadFromStream = ({ storedName, pending }) => {
	var pass = new stream.PassThrough();
	const thumbnailStoredName = `${storedName}_thumbnail`;
	const params = {
		Bucket: S3_BUCKET,
		Key: thumbnailStoredName,
		Body: pass,
	};
	const upload = s3.upload(params).promise();
	if (pending) {
		pending.push(upload);
	}
	return pass;
};

const completeUpload = async (req, res) => {
	const { storedName, parts, uploadId, filePath, batchId, name, type } =
		req.body;

	let params = {
		Bucket: S3_BUCKET,
		Key: storedName,
		MultipartUpload: {
			Parts: parts,
		},
		UploadId: uploadId,
	};
	let data = await s3.completeMultipartUpload(params).promise();

	// create image thumbnail
	if (type.startsWith('image/')) {
		params = {
			Bucket: S3_BUCKET,
			Key: storedName,
		};
		const obj = await s3.getObject(params).promise();

		let pendingThumbnailFileWrites = [];
		sharp(obj.Body)
			.resize(200, 200, {
				fit: 'inside',
			})
			.pipe(
				uploadFromStream({
					storedName,
					pending: pendingThumbnailFileWrites,
				})
			);
		await Promise.all(pendingThumbnailFileWrites);

		upload[batchId].push({
			storedName,
			filePath,
			size: obj.ContentLength,
			name,
			type,
		});
	} else {
		params = {
			Bucket: S3_BUCKET,
			Key: storedName,
		};
		const obj = await s3.headObject(params).promise();

		upload[batchId].push({
			storedName,
			filePath,
			size: obj.ContentLength,
			name,
			type,
		});
	}

	res.send({ data });
};

export default completeUpload;
