import { clipboard } from '..';

const copy = async (req, res) => {
	const { userId, selectedFolders, selectedFiles } = req.body;

	clipboard[userId] = {
		selectedFolders,
		selectedFiles,
		type: 'copy',
	};

	res.status(200).json({ message: 'Added to clipboard, copy' });
};

export default copy;
