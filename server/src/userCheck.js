import { gql } from 'graphql-request';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import { getUserId } from './utils';

export const userEditCheck = async (req, res, next) => {
	const userId = getUserId({ req });
	const { records } = res.locals;

	await userAccessTypeCheck({
		userId,
		records,
		accessType: 'EDIT',
		res,
		next,
	});
};

export const userViewCheck = async (req, res, next) => {
	const userId = getUserId({ req });
	const { records } = res.locals;

	await userAccessTypeCheck({
		userId,
		records,
		accessType: 'VIEW',
		res,
		next,
	});
};

export const ownerCheck = async (req, res, next) => {
	const userId = getUserId({ req });
	const { records } = res.locals;

	await userAccessTypeCheck({
		userId,
		records,
		accessType: 'OWNER',
		res,
		next,
	});
};

// maybe can reuse this in upload, even with the res
export const userAccessTypeCheck = async ({
	userId,
	records,
	accessType,
	res,
	next,
}) => {
	const userCollection = await sharingCollectionOfUserFetch({ userId });
	// check all parent folders to determine if they have a view or edit link
	if (
		await authorizedForAccessType({
			userCollection,
			accessType,
			userId,
			records,
		})
	) {
		if (next) next();
		return true;
	}

	if (res) res.status(403).json({ message: 'unauthorized' });
	return false;
};

const authorizedForAccessType = async ({
	records,
	userCollection,
	accessType,
	userId,
}) => {
	const _helper = (path) => {
		let isAuthorized = false;

		// if root folder is owner, then all accessTypes are valid
		const rootRecord = path[path.length - 1];
		const { meta } = rootRecord;
		if (meta.userId === userId) {
			isAuthorized = true;
		}

		// if root folder is not authorized check for edit and view accesstypes
		if (!isAuthorized) {
			for (const record of path) {
				let isIncluded;
				if (accessType === 'EDIT') {
					const editPermissionOfThisFile =
						record.meta.sharingPermission.sharingPermissionLinks.find(
							(el) => el.accessType === 'EDIT'
						);
					isIncluded = userCollection.includes(editPermissionOfThisFile.link);

					if (isIncluded) {
						isAuthorized = true;
						break;
					}
				} else if (accessType === 'VIEW') {
					// either permission is okay for view
					isIncluded = userCollection.includes(
						record.meta.sharingPermission.sharingPermissionLinks[0].link
					);
					if (!isIncluded) {
						// if still false, check the next one
						isIncluded = userCollection.includes(
							record.meta.sharingPermission.sharingPermissionLinks[1].link
						);
					}

					if (isIncluded) {
						isAuthorized = true;
						break;
					}
				}

				// return false;
			}
		}
		return isAuthorized;
	};

	// if even one record is unauthorized, the entire request is forbidden
	for (const path of Object.values(records.getFoldersPath())) {
		if (!_helper(path)) {
			return false;
		}
	}
	for (const path of Object.values(records.getFilesPath())) {
		if (!_helper(path)) {
			return false;
		}
	}

	return true;
};

const sharingCollectionOfUserFetch = async ({ userId }) => {
	let queryArgs, query, response;

	queryArgs = {
		where: {
			userId: { _eq: userId },
		},
	};
	query = gql`
		query {
			sharedWithMe(${objectToGraphqlArgs(queryArgs)}) {
				collection
			}
		}
	`;
	response = await graphQLClient.request(query);
	return response.sharedWithMe.length === 0
		? []
		: JSON.parse(response.sharedWithMe[0].collection);
};
