import { graphQLClient } from '../endpoint.js';
import { genericMeta, getUserId } from '../utils.js';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';
import {
	deleteRootFolderDelayInDemo,
	demoFolderIdsToCopyInInitialize,
} from '../constants.js';
import copy from './copy.js';
import paste from './paste.js';
import { getRecords } from '../getRecordsMiddleware.js';

const { NODE_ENV } = process.env;

//create root folder for each user, to prevent the need to deal with null as a folderId or folderId
const getRootUserFolder = async (req, res) => {
	const userId = getUserId({ req });
	let response;

	const queryArgs = {
		where: {
			_and: [
				{ folderId: { _isNull: true } },
				{
					meta: {
						userId: { _eq: userId },
					},
				},
			],
		},
	};
	const query = gql`
        query {
            folder(${objectToGraphqlArgs(queryArgs)}) {
                id
            }
        }
    `;
	response = await graphQLClient.request(query);

	if (response.folder.length === 0) {
		const mutationArguments = {
			name: `${userId}_root_folder`,
			trashSize: 0,
			meta: genericMeta({ req }),
		};
		const mutation = gql`
			mutation {
				insertFolderOne(${objectToGraphqlMutationArgs(mutationArguments)}) {
					id
				}
			}
		`;
		const response = await graphQLClient.request(mutation);
		// console.log(response.insertFolderOne);

		if (NODE_ENV === 'demo') {
			// copy folders
			const selectedFolders = demoFolderIdsToCopyInInitialize;
			const selectedFiles = [];

			res.locals.initialize = true;

			req.body.selectedFolders = selectedFolders;
			req.body.selectedFiles = selectedFiles;
			res.locals.records = await getRecords({
				selectedFiles,
				selectedFolders,
			});

			await copy(req, res);

			const folderId = response.insertFolderOne.id;
			delete req.body.selectedFolders;
			delete req.body.selectedFiles;
			req.body.folderId = folderId;
			res.locals.records = await getRecords({
				selectedFiles: [],
				selectedFolders: [folderId],
			});
			await paste(req, res);

			// delete root folder on a timer
			const args = {
				where: {
					id: { _eq: folderId },
				},
			};

			const mutation = gql`
				mutation {
					deleteFolder(${objectToGraphqlArgs(args)}) {
						returning {
							id
						}
					}
				}
			`;
			setTimeout(() => {
				graphQLClient.request(mutation);
			}, [deleteRootFolderDelayInDemo]);
		}

		res.json(response.insertFolderOne);
	} else {
		res.json(response.folder[0]);
	}
};

export default getRootUserFolder;
