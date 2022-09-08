import { GraphQLClient, gql } from 'graphql-request';
import meter from 'stream-meter';
import BusBoy from 'busboy';
import { v4 as uuidv4 } from 'uuid';
import stream from 'stream';
import s3 from '../s3.js';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from '@SanjayDookhoo/hasura-args';
import { graphQLClient } from '../endpoint.js';
import { genericMeta } from '../utils';
import util  from 'util'

const { GRAPHQL_ENDPOINT, S3_BUCKET } = process.env;

// https://stackoverflow.com/questions/37336050/pipe-a-stream-to-s3-upload
const uploadFromStream = (filename, pendingFileWrites) => {
	var pass = new stream.PassThrough();
	const fileNameSplit = filename.split('.');
	const storedFileName = `${uuidv4()}.${fileNameSplit[fileNameSplit.length - 1]}`;
	const params = {
		Bucket: S3_BUCKET,
		Key: storedFileName,
		Body: pass,
	};
	const upload = s3.upload(params).promise();
	pendingFileWrites.push(upload);
	return pass;
};
// https://groups.google.com/g/nodejs/c/p1YGPE4euLU?pli=1
const upload = async (req, res) => {
	// storedFileName is a unique id is used to prevent duplicate filenames from overwriting files, this check for duplicates will have to happen on the database side
	// the database will also store both the filename and the storedFileName to uniquely reference a file
	const busboy = new BusBoy({ headers: req.headers });
	let filesPath = [];
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
					fileName: filename,
				});
			});
	});

	busboy.on('field', (field, val) => {
		if (field == 'filesPath') {
			filesPath = JSON.parse(val);
		}
	});

	// issues arise if the res.json is called above multiple times
	busboy.on('finish', () => {
		Promise.all(pendingFileWrites).then(async (fileWrites) => {
			const mutationArguments = []
			const filesPathSet =  [...new Set(filesPath)]
			const filesPathSetOrdered = filesPathSet.sort((a,b) => {
				const aNestLevel = a.split('/').length
				const bNestLevel = b.split('/').length
				return aNestLevel - bNestLevel
			})
			const filesPathSetOrderedMapToFolderId = {}

			filesPathSet.forEach(async fullPath => {
				const split = fullPath.split('/')
				const folderName = split[split.length - 1]
				const path = split.slice(0, split.length - 1).join('/')
				const mutationArguments = {
					folderName,
					parentFolderId: filesPathSetOrderedMapToFolderId[path],
					meta: genericMeta()
				}

				const mutation = gql`
					mutation {
						insertFolderOne(${objectToGraphqlMutationArgs(mutationArguments)}) {
							id
						}
					}
				`;

				const response = await graphQLClient.request(mutation);
				filesPathSetOrderedMapToFolderId[fullPath] = response.insertFolderOne.id
				// console.log(fullPath, response.insertFolderOne.id)
				console.log(filesPathSetOrderedMapToFolderId)
			})

			setTimeout(async()=> {
				fileWrites.forEach((file, i) => {
					const { Key } = file;
					const { fileName, size } = fileMeta[i];
					const filePath = filesPath[i]
					console.log(filePath)
	
					const data = {
						fileName,
						storedFileName: Key,
						size,
						folderId: filesPathSetOrderedMapToFolderId[filePath],
						meta: genericMeta()
					};
					mutationArguments.push(data)
	
					
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
			}, 1000)

		});
	});

	return req.pipe(busboy);
};

export default upload;
