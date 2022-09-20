import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import remove from './Routes/remove.js';
import upload from './Routes/upload.js';
import { graphqlHTTP } from 'express-graphql';
import schema from './graphql/Schemas/index.js';
import createNewFolder from './Routes/createNewFolder.js';
import search from './Routes/search.js';
import paste from './Routes/paste.js';
import copy from './Routes/copy.js';
import cut from './Routes/cut.js';
import downloadFIle from './Routes/downloadFIle.js';
import rename from './Routes/rename.js';

export const clipboard = {};

const { PORT } = process.env;

const app = express();

app.use(cors());
app.use(express.json());
app.use(
	'/graphql',
	graphqlHTTP({
		schema,
		// graphiql: true,
	})
); // https://www.youtube.com/watch?v=Dr2dDWzThK8

app.post('/upload', upload);
app.post('/remove', remove);
app.post('/createNewFolder', createNewFolder);
app.post('/search', search);
app.post('/cut', cut);
app.post('/copy', copy);
app.post('/paste', paste);
app.post('/downloadFile', downloadFIle);
app.post('/rename', rename);

app.listen(PORT, () => {
	console.log(`Example app listening at http://localhost:${PORT}`);
});
