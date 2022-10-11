import s3 from '../s3.js';
import { thumbnailName } from '../utils.js';
const { S3_BUCKET, SECRET_HEADER } = process.env;

// testing
// https://stackoverflow.com/questions/27753411/how-do-i-delete-an-object-on-aws-s3-using-javascript
const permanentlyDeleteFile = async (req, res) => {
	const { stored_name: storedName } = req.body.event.data.old;
	let params;

	if (req.headers.secret_header != SECRET_HEADER) {
		return res.status(400).json({ message: 'not authorized' });
	}

	params = {
		Bucket: S3_BUCKET,
		Key: `${storedName}`,
	};
	await s3.deleteObject(params, () => {});

	params = {
		Bucket: S3_BUCKET,
		Key: `${thumbnailName(storedName)}`,
	};
	await s3.deleteObject(params, () => {});

	// is return even needed?
	return res.status(200).json({ message: 'done' });
};

export default permanentlyDeleteFile;
