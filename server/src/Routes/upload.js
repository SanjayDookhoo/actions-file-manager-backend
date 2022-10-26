import { GraphQLClient, gql } from 'graphql-request';
import meter from 'stream-meter';
import BusBoy from 'busboy';
import { v4 as uuidv4 } from 'uuid';
import stream from 'stream';
import s3 from '../s3.js';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { graphQLClient } from '../endpoint.js';
import { genericMeta, getUserId, folderSizesMutationUpdates } from '../utils';
import util from 'util';
import sharp from 'sharp';
import { errorHandler } from '../index.js';
import { getRecords } from '../getRecordsMiddleware.js';

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

	const tryCatch = async (tryer) => {
		try {
			await tryer();
		} catch (err) {
			errorHandler(err, req, res);
		}
	};

	busboy.on('file', (fieldName, file, name, encoding, mimeType) => {
		tryCatch(() => {
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
	});

	busboy.on('field', (field, val) => {
		tryCatch(() => {
			if (field == 'filesPath') {
				filesPath = JSON.parse(val);
			}
		});
	});

	// issues arise if the res.json is called above multiple times
	busboy.on('finish', () => {
		Promise.all(pendingThumbnailFileWrites).then((_) => {
			Promise.all(pendingFileWrites).then((fileWrites) => {
				tryCatch(async () => {
					const mutationArguments = [];
					const filesPathSet = [...new Set(filesPath)];
					const filesPathMapToFolderId = {};
					const filesPathMapSize = {};

					// after all uploads are completed, which may take some time, getRecords then, rather than using what is in res.locals, since the size may be stale data
					const records = await getRecords({
						selectedFolders: [folderId],
						selectedFiles: [],
					});

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

						const data = {
							name,
							folderId: parentFolderId,
							meta: genericMeta({ userId }),
						};
						const mutation = gql`
							mutation {
								insertFolderOne(${objectToGraphqlMutationArgs(data)}) {
									id
								}
							}
						`;

						const response = await graphQLClient.request(mutation);
						const newFolderId = response.insertFolderOne.id;
						records.addFolder({
							id: newFolderId,
							...data,
						});
						filesPathMapToFolderId[fullPath] = newFolderId;
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

						const id = filesPathMapToFolderId[filePath] ?? folderId;
						if (id) {
							if (filesPathMapSize[id]) {
								filesPathMapSize[id] += size;
							} else {
								filesPathMapSize[id] = size;
							}
						}

						const data = {
							name,
							storedName: Key,
							size,
							mimeType,
							folderId: id,
							meta: genericMeta({ userId }),
						};
						mutationArguments.push(data);
					});

					const folderSizes = Object.entries(filesPathMapSize).map(
						([id, size]) => ({
							id,
							inc: true,
							size,
						})
					);

					const folderSizesUpdates = await folderSizesMutationUpdates(
						records,
						folderSizes
					);

					const mutation = gql`
						mutation {
							updateFolderMany(${objectToGraphqlArgs({ updates: folderSizesUpdates })}) {
								affected_rows
							}
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
	});

	return req.pipe(busboy);
};

export default upload;
