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
				deletedInRootUserFolderId: { _eq: userId },
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
