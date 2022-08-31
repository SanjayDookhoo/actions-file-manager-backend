import { GraphQLClient } from 'graphql-request';
import meter from 'stream-meter';
import BusBoy from 'busboy';
import { v4 as uuidv4 } from 'uuid';
import stream from 'stream';
import s3 from '../s3.js';

const { GRAPHQL_ENDPOINT, S3_BUCKET } = process.env;

const inputPreprocess = (obj) => {
	const json = JSON.stringify(obj);
	const unquoted = json.replace(/"([^"]+)":/g, '$1:');
	return unquoted;
};

// https://stackoverflow.com/questions/37336050/pipe-a-stream-to-s3-upload
const uploadFromStream = (filename, pendingFileWrites) => {
	var pass = new stream.PassThrough();
	const filename_split = filename.split('.');
	const s3_file_name = `${uuidv4()}.${filename_split[filename_split.length - 1]}`;
	const params = {
		Bucket: S3_BUCKET,
		Key: s3_file_name,
		Body: pass,
	};
	const upload = s3.upload(params).promise();
	pendingFileWrites.push(upload);
	return pass;
};
// https://groups.google.com/g/nodejs/c/p1YGPE4euLU?pli=1
const upload = async (req, res) => {
	// s3_file_name is a unique id is used to prevent duplicate filenames from overwriting files, this check for duplicates will have to happen on the database side
	// the database will also store both the filename and the s3_file_name to uniquely reference a file
	const busboy = new BusBoy({ headers: req.headers });
	let graphql_request = '';
	let pendingFileWrites = [];
	let fileMeta = [];

	busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
		// https://stackoverflow.com/questions/31807073/node-busboy-get-file-size
		// gets total file size of stream
		var m = meter();
		file.pipe(m)
			.pipe(uploadFromStream(filename, pendingFileWrites))
			.on('finish', function () {
				fileMeta.push({
					size: m.bytes,
					file_name: filename,
				});
			});
	});

	busboy.on('field', (field, val) => {
		if (field == 'graphql') {
			graphql_request = val;
		}
	});

	// issues arise if the res.json is called above multiple times
	busboy.on('finish', () => {
		Promise.all(pendingFileWrites).then(async (fileWrites) => {
			fileWrites.forEach((file, i) => {
				const { Key } = file;
				const { file_name, size } = fileMeta[i];

				const data = {
					file_name,
					s3_file_name: Key,
					size,
				};
				/*
				reference sheet: https://www.fileformat.info/info/charset/UTF-8/list.htm

				PARTIAL LINE BACKWARD (U+008C)
				index
				PARTIAL LINE BACKWARD (U+008C)
				*/
				graphql_request = graphql_request.replace(
					`"Œ${i}Œ"`,
					inputPreprocess(data)
				);
			});

			const graphQLClient = new GraphQLClient(GRAPHQL_ENDPOINT, {
				headers: req.headers, // spread headers received by expressjs, use that to complete the request
			});
			const data = await graphQLClient.request(graphql_request);
			res.json(data);
		});
	});

	return req.pipe(busboy);
};

export default upload;
