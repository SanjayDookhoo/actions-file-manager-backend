import s3 from '../s3.js';
const { S3_BUCKET } = process.env;

// testing
// https://stackoverflow.com/questions/27753411/how-do-i-delete-an-object-on-aws-s3-using-javascript
const permanentlyDeleteFile = async (req, res) => {
	const { stored_name } = req.body.event.data.old;

	const params = {
		Bucket: S3_BUCKET,
		Key: `${stored_name}`,
	};

	const data = await s3.deleteObject(params, () => {});

	// is return even needed?
	return res.status(200).json({ message: 'done' });
};

export default permanentlyDeleteFile;
