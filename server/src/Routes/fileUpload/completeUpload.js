import sharp from 'sharp';
import { upload } from '../..';
import s3 from '../../s3';
import stream from 'stream';

const { S3_BUCKET } = process.env;

// https://stackoverflow.com/questions/37336050/pipe-a-stream-to-s3-upload
const uploadFromStream = ({ ext, uuid, pending, thumbnail = false }) => {
	var pass = new stream.PassThrough();
	const extraPostPend = thumbnail ? '_thumbnail' : '';
	const storedName = `${uuid}${extraPostPend}.${ext}`;
	const params = {
		Bucket: S3_BUCKET,
		Key: storedName,
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
		let storedNameSplit = storedName.split('.');
		const ext = storedNameSplit.pop();
		const uuid = storedNameSplit.join('.');
		sharp(obj.Body)
			.resize(200, 200, {
				fit: 'inside',
			})
			.pipe(
				uploadFromStream({
					ext,
					uuid,
					pending: pendingThumbnailFileWrites,
					thumbnail: true,
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
		// params = {
		// 	Bucket: S3_BUCKET,
		// 	Key: storedName,
		// };
		// const obj = await s3.headObject(params).promise();

		// headObject does not work for some reason, presumably, access needs to be granted specifically for that, since it cant be anonymouse like getObject
		// therefore getObject with the smallest range possible
		params = {
			Bucket: S3_BUCKET,
			Key: storedName,
			Range: 'bytes=0-0', // example Range: 'bytes=0-1024' https://aws.plainenglish.io/optimize-your-aws-s3-performance-27b057f231a3
		};
		const obj = await s3.getObject(params).promise();

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
