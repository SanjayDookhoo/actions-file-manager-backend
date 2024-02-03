import { clipboard } from '../index.js';
import { getUserId } from '../utils.js';

const cut = async (req, res) => {
	const userId = getUserId({ req });
	const { selectedFolders, selectedFiles } = req.body;

	clipboard[userId] = {
		selectedFolders,
		selectedFiles,
		type: 'cut',
	};

	res.status(200).json({ message: 'Added to clipboard, cut' });
};

export default cut;
