import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const permanentlyDelete = async (req, res) => {
	const { selectedFolders, selectedFiles, all } = req.body;
	let mutation;
	let response;

	let folderArgs;
	let fileArgs;

	if (all) {
		folderArgs = {
			where: {
				deleted: { _eq: true },
			},
		};
		fileArgs = {
			where: {
				deleted: { _eq: true },
			},
		};
	} else {
		folderArgs = {
			where: {
				id: { _in: selectedFolders },
			},
		};
		fileArgs = {
			where: {
				id: { _in: selectedFiles },
			},
		};
	}
	// delete files first, when folders are deleted, all of its children will be cascade deleted, files important incase it has no folder parent
	mutation = gql`
		mutation {
			deleteFile(${objectToGraphqlArgs(fileArgs)}) {
				returning {
					id
				}
			}
		}
	`;
	response = await graphQLClient.request(mutation);

	mutation = gql`
		mutation {
			deleteFolder(${objectToGraphqlArgs(folderArgs)}) {
				returning {
					id
				}
			}
		}
	`;
	response = await graphQLClient.request(mutation);

	res.json(response);
};

export default permanentlyDelete;
