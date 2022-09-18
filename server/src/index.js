import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import remove from './Routes/remove.js';
import upload from './Routes/upload.js';
import { graphqlHTTP } from 'express-graphql';
import schema from './graphql/Schemas/index.js';
import createNewFolder from './Routes/createNewFolder.js';
import search from './Routes/search.js';

const {PORT} = process.env;

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

app.listen(PORT, () => {
	console.log(`Example app listening at http://localhost:${PORT}`);
});
