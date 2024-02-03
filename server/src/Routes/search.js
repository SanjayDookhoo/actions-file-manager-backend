import { graphQLClient } from '../endpoint.js';
import { getRootFolderArgsAndAccessType, getUserId, update } from '../utils.js';
import { objectToGraphqlArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const search = async (req, res) => {
	const userId = getUserId({ req });
	const { search, folderId } = req.body;
	let searchResponse = [];

	/**
	 * if search is 'test   5'
	 * the search is looking for a folder or file that matches EITHER 'test' or '5' in it because it is seperated by whitespaces
	 * considering the case of 'tes', if the name is 'now test' or 'test now', both is valid, as long as it starts with the search term, or anywhere with a space is followed by the search term
	 *  */
	const orCondition = [];
	const splitSearch = search.split(' ').filter((el) => el !== ''); // ie '1   6  5' becomes ['1', '6', '5']
	splitSearch.forEach((search) => {
		// starts with search
		orCondition.push({ name: { _ilike: `${search}%` } });
		// search is somewhere else, but begins with at least one space
		orCondition.push({ name: { _ilike: `% ${search}%` } });
	});

	if (Number.isInteger(folderId)) {
		// home has a root folder, so it can be searched for in here
		searchResponse = await recursiveFolderSearch(folderId, orCondition, [], []);
	} else if (folderId === 'Shared with me') {
		searchResponse = await uniqueSearch(folderId, orCondition, userId);
	} else if (folderId === 'Recycle bin') {
		searchResponse = await uniqueSearch(folderId, orCondition, userId);
	}

	res.status(200).json(searchResponse);
};

export default search;

const uniqueSearch = async (folderId, orCondition, userId) => {
	let searchResponse = [],
		graphqlResponse;

	// search sub folders
	const { args } = await getRootFolderArgsAndAccessType({
		folderId,
		userId,
	});
	const query = (__typename) => {
		return gql`
				query {
					${__typename}(${objectToGraphqlArgs(args)}) {
						id
						name
					}
				}
			`;
	};
	graphqlResponse = await graphQLClient.request(query('folder'));
	for (const { id, name } of graphqlResponse.folder) {
		searchResponse = [
			...searchResponse,
			...(await recursiveFolderSearch(id, orCondition, [id], [name])),
		];
	}

	// search this root directory files for matching files and folders
	// this is the unique args, but with the orCondition also to allow matching
	const newArgs = update(args, {
		where: {
			_and: {
				$push: [{ _or: orCondition }],
			},
		},
	});
	searchResponse = [
		...searchResponse,
		...(await searchOnlyByGivenArgs(newArgs, [], [])),
	];

	return searchResponse;
};

const recursiveFolderSearch = async (
	folderId,
	orCondition,
	relativePath,
	relativePathName
) => {
	let graphqlResponse;
	let searchResponse = [];

	// search all nested folders
	const nestedFolderQueryArguments = {
		where: {
			_and: [
				{ folderId: { _eq: folderId } },
				{ deletedInRootToUserId: { _isNull: true } },
			],
		},
	};

	const nestedFolderQuery = gql`
		query {
			folder(${objectToGraphqlArgs(nestedFolderQueryArguments)}) {
				id
				name
			}
		}
	`;
	graphqlResponse = await graphQLClient.request(nestedFolderQuery);
	for (const folder of graphqlResponse.folder) {
		searchResponse = [
			...searchResponse,
			...(await recursiveFolderSearch(
				folder.id,
				orCondition,
				[...relativePath, folder.id],
				[...relativePathName, folder.name]
			)),
		];
	}

	// in this folder, find any matches of files or folders
	const queryArgs = {
		where: {
			_and: [
				{ _or: orCondition },
				{ folderId: { _eq: folderId } },
				{ deletedInRootToUserId: { _isNull: true } },
			],
		},
	};
	searchResponse = [
		...searchResponse,
		...(await searchOnlyByGivenArgs(queryArgs, relativePath, relativePathName)),
	];

	return searchResponse;
};

const searchOnlyByGivenArgs = async (
	queryArgs,
	relativePath,
	relativePathName
) => {
	let graphqlResponse,
		searchResponse = [];
	const query = (__typename) => {
		return gql`
			query {
				${__typename}(${objectToGraphqlArgs(queryArgs)}) {
					id
					name
				}
			}
		`;
	};

	// all folders that match the search query
	graphqlResponse = await graphQLClient.request(query('folder'));
	searchResponse = [
		...searchResponse,
		...graphqlResponse.folder.map((folder) => ({
			...folder,
			relativePath,
			relativePathName,
			__typename: 'folder',
		})),
	];

	// all files that match the search query
	graphqlResponse = await graphQLClient.request(query('file'));
	searchResponse = [
		...searchResponse,
		...graphqlResponse.file.map((file) => ({
			...file,
			relativePath,
			relativePathName,
			__typename: 'file',
		})),
	];

	return searchResponse;
};
