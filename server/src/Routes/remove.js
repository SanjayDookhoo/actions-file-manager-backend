import { graphQLClient } from '../endpoint';
import { genericMeta } from '../utils';
import { objectToGraphqlArgs, objectToGraphqlMutationArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const remove = async (req, res) => {
	const { selectedFolders, selectedFiles } = req.body;
	let mutation;
	let response;

	for (const selectedFolder of selectedFolders) {
		const rootUserFolderId = await getRootUserFolderId({
			id: selectedFolder,
			__typename: 'Folder',
		});

		const folderArgs = {
			where: {
				id: { _eq: selectedFolder },
			},
			_set: { deletedInRootUserFolderId: rootUserFolderId },
		};
		mutation = gql`
			mutation {
				updateFolder(${objectToGraphqlArgs(folderArgs)}) {
					returning {
						id
					}
				}
			}
		`;
		response = await graphQLClient.request(mutation);
	}

	for (const selectedFile of selectedFiles) {
		const rootUserFolderId = await getRootUserFolderId({
			id: selectedFile,
			__typename: 'File',
		});
		console.log(rootUserFolderId);

		const fileArgs = {
			where: {
				id: { _eq: selectedFile },
			},
			_set: { deletedInRootUserFolderId: rootUserFolderId },
		};

		mutation = gql`
			mutation {
				updateFile(${objectToGraphqlArgs(fileArgs)}) {
					returning {
						id
					}
				}
			}
		`;
		response = await graphQLClient.request(mutation);
	}

	res.json({});
};

export default remove;

const getRootUserFolderId = async ({ id, __typename }) => {
	// get first folder
	let record;
	if (__typename == 'Folder') {
		const queryArgs = {
			where: {
				id: { _eq: id },
			},
		};
		const query = gql`
			query {
				folder(${objectToGraphqlArgs(queryArgs)}) {
					id
					parentFolderId
					meta {
						userId
						sharingPermission{
							sharingPermissionLinks{
								accessType
								link
							}
						}
					}
				}
			}
		`;
		const response = await graphQLClient.request(query);
		const { parentFolderId, meta } = response.folder[0];
		record = {
			parentFolderId,
			meta,
		};
	} else {
		const queryArgs = {
			where: {
				id: { _eq: id },
			},
		};
		const query = gql`
			query {
				file(${objectToGraphqlArgs(queryArgs)}) {
					id
					folderId
					meta {
						userId
						sharingPermission{
							sharingPermissionLinks{
								accessType
								link
							}
						}
					}
				}
			}
		`;
		const response = await graphQLClient.request(query);
		const { folderId, meta } = response.file[0];
		record = {
			parentFolderId: folderId,
			meta,
		};
	}

	const _helper = async ({ record }) => {
		const { id, meta, parentFolderId } = record;
		if (!parentFolderId) return meta.userId;

		// fetch parent data
		const queryArgs = {
			where: {
				id: { _eq: id },
			},
		};
		const query = gql`
			query {
				folder(${objectToGraphqlArgs(queryArgs)}) {
					id
					parentFolderId
					meta {
						userId
						sharingPermission{
							sharingPermissionLinks{
								accessType
								link
							}
						}
					}
				}
			}
		`;
		const response = await graphQLClient.request(query);
		return await _helper({
			record: response.folder[0],
		});
	};

	return await _helper({ record });
};
