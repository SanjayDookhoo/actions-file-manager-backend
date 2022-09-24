import 'dotenv/config';
import ws, { WebSocketServer } from 'ws';
import { execute } from 'apollo-link';
import { WebSocketLink } from 'apollo-link-ws';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import gql from 'graphql-tag';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import { getUserId } from './utils';
import { userAccessTypeCheck } from './userCheck';

const { GRAPHQL_ENDPOINT_WS } = process.env;

const getWsClient = function (wsurl) {
	const client = new SubscriptionClient(
		wsurl,
		{
			reconnect: true,
			connectionParams: {
				headers: {
					// Authorization: 'Bearer xxxxx',
					'x-hasura-admin-secret': 'myadminsecretkey',
				},
			},
		},
		ws
	);
	return client;
};

const createSubscriptionObservable = (wsurl, query, variables) => {
	const link = new WebSocketLink(getWsClient(wsurl));
	return execute(link, { query: query, variables: variables });
};

const subscriptionClient = async ({ __typename, args, token }) => {
	const userId = getUserId({ token });
	let SUBSCRIBE_QUERY;
	let newArgs;
	let newArgsFile, newArgsFolder;
	let authorizedToEdit, authorizedToView;
	if (args == 'Home') {
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

		newArgs = {
			where: {
				_and: [
					{ folderId: { _eq: id } },
					{ deletedInRootUserFolderId: { _isNull: true } },
				],
			},
		};
	} else if (args == 'Shared with me') {
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

		newArgs = {
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
	} else if (args == 'Recycle bin') {
		newArgs = {
			where: {
				deletedInRootUserFolderId: { _eq: userId },
			},
		};
	} else {
		authorizedToEdit = await userAccessTypeCheck({
			userId,
			selectedFolders: [args],
			selectedFiles: [],
			accessType: 'EDIT',
		});

		if (!authorizedToEdit) {
			authorizedToView = await userAccessTypeCheck({
				userId,
				selectedFolders: [args],
				selectedFiles: [],
				accessType: 'VIEW',
			});
		}

		if (authorizedToEdit || authorizedToView) {
			// subscribe to folders, where args is the folderId
			newArgs = {
				where: {
					_and: [
						{ folderId: { _eq: args } },
						{ deletedInRootUserFolderId: { _isNull: true } },
					],
				},
			};
		} else {
			// this condition will never be met, so nothing would show if they are not authorized
			// TODO, return an error instead
			newArgs = {
				where: {
					folderId: { _isNull: true },
				},
			};
		}
	}

	const subscribeQuery = (__typename) => {
		return gql`
			subscription {
				${__typename}(${objectToGraphqlArgs(newArgs)}) {
					id
					name
					meta {
						modified
						created
						lastAccessed
						sharingPermission {
							sharingPermissionLinks {
								link
							}
						}
					}
				}
			}
		`;
	};

	let accessType = null;
	if (authorizedToEdit) accessType = 'EDIT';
	else if (authorizedToView) accessType = 'VIEW';

	return {
		subscriptionObservable: createSubscriptionObservable(
			GRAPHQL_ENDPOINT_WS,
			subscribeQuery(__typename)
		),
		accessType,
	};
	// return createSubscriptionObservable(
	// 	GRAPHQL_ENDPOINT_WS,
	// 	subscribeQuery(__typename)
	// );
};

export const webSocket = (server) => {
	const wss = new WebSocketServer({ server: server });

	wss.on('connection', (socket) => {
		console.log('a new client connected');
		let consumers = [];
		socket.on('message', async (_data) => {
			const data = JSON.parse(_data);
			const { __typename, id } = data;
			// console.log({ __typename, args, id });

			// add to list of consumers, so the most recent consumer will be what is returning a result to the frontend
			// stale queries wont conflict with new queries
			consumers.unshift({
				id,
				__typename,
			});

			const { subscriptionObservable, accessType } = await subscriptionClient({
				...data,
			});

			const subscription = subscriptionObservable.subscribe(
				(eventData) => {
					// Do something on receipt of the event, if it is the most recent subscription of subscription of

					const mostRecent = consumers.find(
						(consumer) => consumer.__typename == __typename
					);
					if (mostRecent.id == id) {
						socket.send(
							JSON.stringify({ status: 200, data: eventData.data, accessType })
						);
						// console.log('sending data', eventData.data);
					}
				},
				(err) => {
					console.log('Err');
					console.log(err);
				}
			);

			const consumer = consumers.find((consumer) => consumer.id == id);
			if (consumer) consumer.subscription = subscription;

			const mostRecentFile = consumers.find(
				(consumer) => consumer.__typename == 'file'
			);
			const mostRecentFolder = consumers.find(
				(consumer) => consumer.__typename == 'folder'
			);

			const toRemove = consumers.filter(
				(consumer) =>
					!(
						consumer.id == mostRecentFile?.id ||
						consumer.id == mostRecentFolder?.id
					)
			);
			consumers = consumers.filter(
				(consumer) =>
					consumer.id == mostRecentFile?.id ||
					consumer.id == mostRecentFolder?.id
			);

			toRemove.forEach((consumer) => {
				if (consumer?.subscription?.unsubscribe) {
					consumer.subscription.unsubscribe();
				}
			});

			// console.log(consumers.length);
		});

		socket.on('close', () => {
			console.log('client disconnected');
			consumers.forEach((consumer) => {
				if (consumer?.subscription?.unsubscribe) {
					consumer.subscription.unsubscribe();
				}
			});
		});
	});
};
