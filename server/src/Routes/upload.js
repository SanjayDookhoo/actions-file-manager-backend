import { GraphQLClient, gql } from 'graphql-request';
import meter from 'stream-meter';
import BusBoy from 'busboy';
import { v4 as uuidv4 } from 'uuid';
import stream from 'stream';
import s3 from '../s3.js';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { graphQLClient } from '../endpoint.js';
import { genericMeta, getUserId } from '../utils';
import util from 'util';
import sharp from 'sharp';

const { GRAPHQL_ENDPOINT, S3_BUCKET } = process.env;

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

const resizeStream = sharp().resize(200, 200, {
	fit: 'inside',
});

// https://groups.google.com/g/nodejs/c/p1YGPE4euLU?pli=1
const upload = async (req, res) => {
	// storedName is a unique id is used to prevent duplicate filenames from overwriting files, this check for duplicates will have to happen on the database side
	// the database will also store both the filename and the storedName to uniquely reference a file
	const busboy = new BusBoy({ headers: req.headers });
	let filesPath = [];
	let folderId = req.headers.folderid;
	let pendingFileWrites = [];
	let pendingThumbnailFileWrites = [];
	let fileMeta = [];
	const userId = getUserId({ req });

	busboy.on('file', (fieldName, file, name, encoding, mimeType) => {
		const ext = name.split('.').pop();
		const uuid = uuidv4();

		if (mimeType.startsWith('image/')) {
			// https://stackoverflow.com/questions/31807073/node-busboy-get-file-size
			// gets total file size of stream
			var m = meter();
			file
				.pipe(m)
				.pipe(uploadFromStream({ ext, uuid, pending: pendingFileWrites }))
				.pipe(resizeStream)
				.pipe(
					uploadFromStream({
						ext,
						uuid,
						pending: pendingThumbnailFileWrites,
						thumbnail: true,
					})
				)
				.on('finish', function () {
					fileMeta.push({
						size: m.bytes,
						name,
						mimeType,
					});
				});
		} else {
			// https://stackoverflow.com/questions/31807073/node-busboy-get-file-size
			// gets total file size of stream
			var m = meter();
			file
				.pipe(m)
				.pipe(uploadFromStream({ ext, uuid, pending: pendingFileWrites }))
				.on('finish', function () {
					fileMeta.push({
						size: m.bytes,
						name,
						mimeType,
					});
				});
		}
	});

	busboy.on('field', (field, val) => {
		if (field == 'filesPath') {
			filesPath = JSON.parse(val);
		}
	});

	// issues arise if the res.json is called above multiple times
	busboy.on('finish', () => {
		Promise.all(pendingThumbnailFileWrites).then((_) => {
			Promise.all(pendingFileWrites).then(async (fileWrites) => {
				const mutationArguments = [];
				const filesPathSet = [...new Set(filesPath)];
				const filesPathMapToFolderId = {};

				const _recursiveFolderCreation = async (fullPath) => {
					if (!fullPath) return null;
					if (filesPathMapToFolderId[fullPath])
						return filesPathMapToFolderId[fullPath];

					const split = fullPath.split('/');
					const name = split[split.length - 1];
					const path = split.slice(0, split.length - 1).join('/');
					let parentFolderId = filesPathMapToFolderId[path];
					if (!parentFolderId) {
						await _recursiveFolderCreation(path);
						parentFolderId = filesPathMapToFolderId[path];
					}
					// if still null
					if (!parentFolderId) {
						parentFolderId = folderId;
					}

					const mutationArguments = {
						name,
						folderId: parentFolderId,
						meta: genericMeta({ userId }),
					};
					const mutation = gql`
						mutation {
							insertFolderOne(${objectToGraphqlMutationArgs(mutationArguments)}) {
								id
							}
						}
					`;

					const response = await graphQLClient.request(mutation);
					filesPathMapToFolderId[fullPath] = response.insertFolderOne.id;
				};

				// forEach does not work as intended, but this does,
				// https://stackoverflow.com/a/37576787/4224964 (Reading in series)
				// Reading in series chosen because the next folder creation may need the folder created before
				for (const fullPath of filesPathSet) {
					await _recursiveFolderCreation(fullPath);
				}

				fileWrites.forEach((file, i) => {
					const { Key } = file;
					const { name, size, mimeType } = fileMeta[i];
					const filePath = filesPath[i];

					const data = {
						name,
						storedName: Key,
						size,
						mimeType,
						folderId: filesPathMapToFolderId[filePath]
							? filesPathMapToFolderId[filePath]
							: folderId,
						meta: genericMeta({ userId }),
					};
					mutationArguments.push(data);
				});

				const mutation = gql`
					mutation {
						insertFile(${objectToGraphqlMutationArgs(mutationArguments)}) {
							returning {
								id
							}
						}
					}
				`;

				const data = await graphQLClient.request(mutation);
				res.json(data);
			});
		});
	});

	return req.pipe(busboy);
};

export default upload;
