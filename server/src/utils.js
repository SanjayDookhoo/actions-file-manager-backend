import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import _update from 'immutability-helper';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import gql from 'graphql-tag';
import { userAccessTypeCheck } from './userCheck';
import { getRecords } from './getRecordsMiddleware';

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
		const records = await getRecords({
			selectedFolders: [folderId],
			selectedFiles: [],
		});
		authorizedToEdit = await userAccessTypeCheck({
			userId,
			records,
			accessType: 'EDIT',
		});

		if (!authorizedToEdit) {
			authorizedToView = await userAccessTypeCheck({
				userId,
				records,
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
export const folderSizesMutationUpdates = async (
	records,
	folderSizesUpdates
) => {
	let updates = [];
	let newRootSizesByUserId = {};

	for (const { id, inc, size, stopAtDeleted } of folderSizesUpdates) {
		const addSize = size * (inc ? 1 : -1);
		const root = records.getFolderRoot(id);
		const { userId } = root.meta;

		if (!(userId in newRootSizesByUserId)) {
			newRootSizesByUserId[userId] = root.size + root.trashSize;
		}
		newRootSizesByUserId[userId] += addSize;

		const newUpdates = [];
		const path = records.getFolderPath(id);

		for (const folder of path) {
			newUpdates.push({
				where: { id: { _eq: folder.id } },
				_inc: {
					size: addSize,
				},
			});
			// break after changing size of the folder that is deleted
			if (stopAtDeleted && folder.deletedInRootUserFolderId) {
				break;
			}
		}

		updates = [...updates, ...newUpdates];
	}

	// console.log(newRootSizesByUserId);
	for (const [userId, newSize] of Object.entries(newRootSizesByUserId)) {
		if (newSize > (await userMaxSizeCheck(userId))) {
			// similar error to what hasura generates
			throw {
				response: {
					errors: [{ message: 'Not enough available space' }],
				},
			};
		}
	}

	// update folders mutation
	return updates;
};

// TODO: allow making async call here to get the userId role details from another database (in the event that a user is writing to another users file manager)
// the role will be used to determine the max size, and that is checked here, throw an error if writing shouldnt be allowed
// testing
const userMaxSizeCheck = async (userId) => {
	// return 11044304;
	return 99544015222255;
};

export const folderTrashSizesMutationUpdates = (
	records,
	folderSizesUpdates
) => {
	let updates = [];

	for (const { id, inc, size, stopAtDeleted } of folderSizesUpdates) {
		const path = records.getFolderPath(id);
		const foundDeleted = path.filter(
			(folder) => folder.deletedInRootUserFolderId
		);
		if (!stopAtDeleted || (stopAtDeleted && !foundDeleted)) {
			updates = [
				...updates,
				{
					where: { id: { _eq: records.getFolderRoot(id).id } },
					_inc: {
						trashSize: size * (inc ? 1 : -1),
					},
				},
			];
		}
	}
	// update folders mutation
	return updates;
};
