import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import _update from 'immutability-helper';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import gql from 'graphql-tag';
import { userAccessTypeCheck } from './userCheck';
import { getRecords } from './getRecordsMiddleware';
import axios from 'axios';

const { TOKEN_FILTER } = process.env;

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

	const _jq = (obj, transform) => {
		const transformSplit = transform.split('.');
		let finalTransformSplit = [];
		let carryOverPush = '';

		// TOKEN_FILTER='."https://hasura.io/jwt/claims"."x-hasura-user-id"', if there is a dot inside the quotes, it needs to be merged
		transformSplit.forEach((el) => {
			if (carryOverPush != '') {
				if (el.charAt(el.length - 1) == `"`) {
					carryOverPush += '.' + el.slice(0, -1);
					finalTransformSplit.push(carryOverPush);
					carryOverPush = '';
				} else {
					carryOverPush += '.' + el;
				}
			} else if (el.charAt(0) == `"` && el.charAt(el.length - 1) == `"`) {
				finalTransformSplit.push(el.slice(1, -1));
			} else if (el.charAt(0) == `"` && el.charAt(el.length - 1) != `"`) {
				carryOverPush += el.slice(1);
			} else {
				finalTransformSplit.push(el);
			}
		});

		let temp = obj;

		for (const el of finalTransformSplit) {
			if (el != '') {
				temp = temp[el];
				if (!temp) break;
			}
		}
		return temp;
	};

	const userId = _jq(decoded, TOKEN_FILTER);

	return userId;
};

export const update = _update; // does not allow vs code importing because it is not a named export, this makes it easier

export const capitalizeFirstLetter = (string) => {
	return string.charAt(0).toUpperCase() + string.slice(1);
};

export const getRootFolderArgsAndAccessType = async ({ folderId, userId }) => {
	let args;
	let authorizedToEdit, authorizedToView;

	if (folderId === 'Home') {
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
		const id = res.folder.length === 0 ? 0 : res.folder[0].id;

		args = {
			where: {
				_and: [
					{ folderId: { _eq: id } },
					{ deletedInRootToUserId: { _isNull: true } },
				],
			},
		};
	} else if (folderId === 'Shared with me') {
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
		if (res.sharedWithMe.length !== 0) {
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
					{ deletedInRootToUserId: { _isNull: true } },
				],
			},
		};
	} else if (folderId === 'Recycle bin') {
		args = {
			where: {
				_and: [{ deletedInRootToUserId: { _eq: userId } }],
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
						{ deletedInRootToUserId: { _isNull: true } },
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
	return name + '_thumbnail';
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
			if (stopAtDeleted && folder.deletedInRootToUserId) {
				break;
			}
		}

		updates = [...updates, ...newUpdates];
	}

	const { USER_MAX_SIZE_CHECK } = process.env;
	const _userMaxSizeCheck = eval(USER_MAX_SIZE_CHECK);
	// console.log(newRootSizesByUserId);
	for (const [userId, newSize] of Object.entries(newRootSizesByUserId)) {
		const userMaxSizeCheck = await _userMaxSizeCheck(userId, axios);
		if (newSize > userMaxSizeCheck) {
			// similar error to what hasura generates
			throw throwErr('Not enough available space');
		}
	}

	// update folders mutation
	return updates;
};

export const folderTrashSizesMutationUpdates = (
	records,
	folderSizesUpdates
) => {
	let updates = [];

	for (const { id, inc, size, stopAtDeleted } of folderSizesUpdates) {
		const path = records.getFolderPath(id);
		const foundDeleted = path.filter((folder) => folder.deletedInRootToUserId);
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

export const throwErr = (message) => {
	return {
		response: {
			errors: [
				{
					message,
				},
			],
		},
	};
};
