import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import _update from 'immutability-helper';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import gql from 'graphql-tag';
import { userAccessTypeCheck } from './userCheck';

export const genericMeta = ({ req, userId }) => {
	return {
		userId: userId ? userId : getUserId({ req }),
		sharingPermission: {
			sharingPermissionLinks: [
				{
					accessType: 'EDIT',
					link: uuidv4(),
				},
				{
					accessType: 'VIEW',
					link: uuidv4(),
				},
			],
		},
	};
};

export const getUserId = ({ req, token }) => {
	const auth = req?.headers?.authorization;
	if (!auth && !token) return null;

	const decoded = jwt.decode(token ? token : auth.split(' ')[1]);
	return decoded['https://hasura.io/jwt/claims']['x-hasura-user-id']; // TODO, user needs to enter the path to the id
};

export const update = _update; // does not allow vs code importing because it is not a named export, this makes it easier

export const capitalizeFirstLetter = (string) => {
	return string.charAt(0).toUpperCase() + string.slice(1);
};

export const getRootFolderArgsAndAccessType = async ({ folderId, userId }) => {
	let args;
	let authorizedToEdit, authorizedToView;

	if (folderId == 'Home') {
		const otherArgs = {
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
                folder(${objectToGraphqlArgs(otherArgs)}) {
                    id
                }
            }
        `;
		const res = await graphQLClient.request(query);
		const id = res.folder.length == 0 ? 0 : res.folder[0].id;

		args = {
			where: {
				_and: [
					{ folderId: { _eq: id } },
					{ deletedInRootUserFolderId: { _isNull: true } },
				],
			},
		};
	} else if (folderId == 'Shared with me') {
		const otherArgs = {
			where: { userId: { _eq: userId } },
		};
		const query = gql`
            query {
                sharedWithMe(${objectToGraphqlArgs(otherArgs)}) {
                    collection
                }
            }
        `;

		const res = await graphQLClient.request(query);

		let _in;
		if (res.sharedWithMe.length != 0) {
			_in = JSON.parse(res.sharedWithMe[0].collection);
		} else {
			_in = [];
		}

		args = {
			where: {
				_and: [
					{
						meta: {
							sharingPermission: {
								sharingPermissionLinks: { link: { _in } },
							},
						},
					},
					{ deletedInRootUserFolderId: { _isNull: true } },
				],
			},
		};
	} else if (folderId == 'Recycle bin') {
		args = {
			where: {
				_and: [{ deletedInRootUserFolderId: { _eq: userId } }],
			},
		};
	} else {
		authorizedToEdit = await userAccessTypeCheck({
			userId,
			selectedFolders: [folderId],
			selectedFiles: [],
			accessType: 'EDIT',
		});

		if (!authorizedToEdit) {
			authorizedToView = await userAccessTypeCheck({
				userId,
				selectedFolders: [folderId],
				selectedFiles: [],
				accessType: 'VIEW',
			});
		}

		if (authorizedToEdit || authorizedToView) {
			// subscribe to folders
			args = {
				where: {
					_and: [
						{ folderId: { _eq: folderId } },
						{ deletedInRootUserFolderId: { _isNull: true } },
					],
				},
			};
		} else {
			// this condition will never be met, so nothing would show if they are not authorized
			// TODO, return an error instead
			args = {
				where: {
					_and: [{ folderId: { _isNull: true } }],
				},
			};
		}
	}

	let accessType = null;
	if (authorizedToEdit) accessType = 'EDIT';
	else if (authorizedToView) accessType = 'VIEW';

	return { args, accessType };
};

export const thumbnailName = (name) => {
	const nameSplit = name.split('.');
	const ext = nameSplit.pop();
	return nameSplit.join('.') + '_thumbnail.' + ext;
};

// updates = [{ ids, operation, size }, { ids, operation, size }]
export const folderSizesMutationUpdates = async (folderSizesUpdates) => {
	let updates = [];

	for (const { ids, inc, size } of folderSizesUpdates) {
		const folderIds = [];
		// get folders
		const _getFolderIds = async ({ id }) => {
			folderIds.push(id);
			const queryArgs = {
				where: { id: { _eq: id } },
			};
			const query = gql`
				query {
					folder(${objectToGraphqlArgs(queryArgs)}) {
						folderId
					}
				}
			`;

			const response = await graphQLClient.request(query);
			const { folderId } = response.folder[0];
			if (!folderId) return;
			await _getFolderIds({ id: folderId });
		};
		for (const id of ids) {
			await _getFolderIds({ id });
		}

		updates = [
			...updates,
			...folderIds.map((folderId) => ({
				where: { id: { _eq: folderId } },
				_inc: {
					size: size * (inc ? 1 : -1),
				},
			})),
		];
	}

	// update folders mutation
	return updates;
};

export const getAllParentFolderIdsAndSize = async ({
	selectedFolders = [],
	selectedFiles = [],
	all,
}) => {
	const folderIds = [];
	let totalSize = 0,
		response;

	const selectedHandler = async ({ id, __typename }) => {
		const queryArgs = {
			where: { id: { _eq: id } },
		};
		const query = gql`
			query {
				${__typename}(${objectToGraphqlArgs(queryArgs)}) {
					folderId
					size
				}
			}
		`;
		response = await graphQLClient.request(query);
		const { folderId, size } = response[__typename][0];
		folderIds.push(folderId);
		totalSize += size;
	};

	for (const id of selectedFolders) {
		await selectedHandler({ id, __typename: 'folder' });
	}

	for (const id of selectedFiles) {
		await selectedHandler({ id, __typename: 'file' });
	}

	if (all) {
		let query;
		const queryArgs = {
			where: { deletedInRootUserFolderId: { _isNull: false } },
		};

		// folders
		query = gql`
			query {
				folder(${objectToGraphqlArgs(queryArgs)}) {
					folderId
					size
				}
			}
		`;
		response = await graphQLClient.request(query);
		response.folder.forEach(({ folderId, size }) => {
			folderIds.push(folderId);
			totalSize += size;
		});

		// files
		query = gql`
			query {
				file(${objectToGraphqlArgs(queryArgs)}) {
					folderId
					size
				}
			}
		`;
		response = await graphQLClient.request(query);
		response.file.forEach(({ folderId, size }) => {
			folderIds.push(folderId);
			totalSize += size;
		});
	}

	return {
		ids: [...new Set(folderIds)].filter((id) => id != null),
		size: totalSize,
	};
};

export const getRootFolder = async ({ id, __typename }) => {
	// get first folder
	let record;
	const queryArgs = {
		where: {
			id: { _eq: id },
		},
	};
	const query = gql`
		query {
			${__typename}(${objectToGraphqlArgs(queryArgs)}) {
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
	const { folderId, meta } = response[__typename][0];
	record = {
		folderId,
		meta,
	};

	const _helper = async ({ record }) => {
		const { id, meta, folderId } = record;
		if (!folderId) return record;

		// fetch parent data
		const queryArgs = {
			where: {
				id: { _eq: folderId },
			},
		};
		const query = gql`
			query {
				folder(${objectToGraphqlArgs(queryArgs)}) {
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
		return await _helper({
			record: response.folder[0],
		});
	};

	return await _helper({ record });
};
