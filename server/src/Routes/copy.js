import { clipboard } from '..';
import { getUserId } from '../utils';

const copy = async (req, res) => {
	const userId = getUserId({ req });
	const { selectedFolders, selectedFiles } = req.body;

	clipboard[userId] = {
		selectedFolders,
		selectedFiles,
		type: 'copy',
	};

	if (!res.locals.initialize)
		res.status(200).json({ message: 'Added to clipboard, copy' });
};

export default copy;
