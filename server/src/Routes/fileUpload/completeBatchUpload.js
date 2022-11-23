import { upload } from '../..';
import { gql } from 'graphql-request';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { graphQLClient } from '../../endpoint.js';
import {
	genericMeta,
	getUserId,
	folderSizesMutationUpdates,
} from '../../utils';
import { getRecords } from '../../getRecordsMiddleware.js';

const completeBatchUpload = async (req, res) => {
	const { batchId, folderId } = req.body;
	const userId = getUserId({ req });

	const batch = upload[batchId];

	const records = await getRecords({
		selectedFolders: [folderId],
		selectedFiles: [],
	});

	const mutationArguments = [];
	const filesPath = batch.map((record) => record.filePath);
	const filesPathSet = [...new Set(filesPath)];
	const filesPathMapToFolderId = {};
	const filesPathMapSize = {};

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

	batch.forEach((file) => {
		const { storedName, filePath, size, name, type } = file;

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
			storedName,
			size,
			mimeType: type,
			folderId: id,
			meta: genericMeta({ userId }),
		};
		mutationArguments.push(data);
	});

	const folderSizes = Object.entries(filesPathMapSize).map(([id, size]) => ({
		id,
		inc: true,
		size,
	}));

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

	delete upload[batchId];

	res.json(data);
};

export default completeBatchUpload;
