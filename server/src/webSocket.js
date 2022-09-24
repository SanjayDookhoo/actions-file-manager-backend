import 'dotenv/config';
import ws, { WebSocketServer } from 'ws';
import { execute } from 'apollo-link';
import { WebSocketLink } from 'apollo-link-ws';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import gql from 'graphql-tag';
import { objectToGraphqlArgs } from 'hasura-args';
import { graphQLClient } from './endpoint';
import { getUserId } from './utils';

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

const subscriptionClient = async ({ subscriptionOf, args, token }) => {
	const userId = getUserId({ token });
	let SUBSCRIBE_QUERY;
	let newArgs;
	let newArgsFile, newArgsFolder;
	if (args == 'Home') {
		const otherArgs = {
			where: {
				_and: [
					{ parentFolderId: { _isNull: true } },
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
		const id = res.folder[0].id;
		console.log({ id });

		newArgsFile = {
			where: {
				_and: [
					{ folderId: { _eq: id } },
					{ deletedInRootUserFolderId: { _isNull: true } },
				],
			},
		};
		newArgsFolder = {
			where: {
				_and: [
					{ parentFolderId: { _eq: id } },
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
		newArgs = args;
	}
	if (subscriptionOf == 'File') {
		SUBSCRIBE_QUERY = gql`
			subscription {
				file(${objectToGraphqlArgs(newArgs ? newArgs : newArgsFile)}) {
					id
					name
					size
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
	} else if (subscriptionOf == 'Folder') {
		SUBSCRIBE_QUERY = gql`
			subscription {
				folder(${objectToGraphqlArgs(newArgs ? newArgs : newArgsFolder)}) {
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
	}
	return createSubscriptionObservable(GRAPHQL_ENDPOINT_WS, SUBSCRIBE_QUERY);
};

export const webSocket = (server) => {
	const wss = new WebSocketServer({ server: server });

	wss.on('connection', (socket) => {
		console.log('a new client connected');
		let consumers = [];
		socket.on('message', async (_data) => {
			const data = JSON.parse(_data);
			const { subscriptionOf, id } = data;
			// console.log({ subscriptionOf, args, id });

			// add to list of consumers, so the most recent consumer will be what is returning a result to the frontend
			// stale queries wont conflict with new queries
			consumers.unshift({
				id,
				subscriptionOf,
			});
			const subscription = (await subscriptionClient({ ...data })).subscribe(
				(eventData) => {
					// Do something on receipt of the event, if it is the most recent subscription of subscription of

					const mostRecent = consumers.find(
						(consumer) => consumer.subscriptionOf == subscriptionOf
					);
					if (mostRecent.id == id) {
						socket.send(JSON.stringify({ status: 200, data: eventData.data }));
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
				(consumer) => consumer.subscriptionOf == 'File'
			);
			const mostRecentFolder = consumers.find(
				(consumer) => consumer.subscriptionOf == 'Folder'
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
