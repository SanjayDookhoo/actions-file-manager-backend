import { graphQLClient } from '../endpoint';
import { objectToGraphqlArgs } from 'hasura-args';
import { gql } from 'graphql-request';

const delay = 3900000; // 1 mins = 60000, 1 hr and 5 mins 3900000

// automatically deletes the root folder after the delay in milliseconds has passed
const demoDeleteFolder = async (req, res) => {
	const { id, folder_id } = req.body.event.data.new;
	let mutation;
	const args = {
		where: {
			id: { _eq: id },
		},
	};

	mutation = gql`
		mutation {
			deleteFolder(${objectToGraphqlArgs(args)}) {
				returning {
					id
				}
			}
		}
	`;
	if (!folder_id) {
		setTimeout(() => {
			graphQLClient.request(mutation);
		}, [delay]);
	}

	return res.status(200).json({ message: 'done' });
};

export default demoDeleteFolder;
