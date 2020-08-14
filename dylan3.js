// First argument the user credentials
// Second optional argument discography relative file path

const axios = require('axios').default;
const querystring = require('querystring');
const fs = require('fs');
require('dotenv').config();

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';
const SPOTIFY_ARTISTS_URL = 'https://api.spotify.com/v1/artists';
const TRELLO_BASE_URL = 'https://api.trello.com/1/';

const TRELLO_USER_TOKEN = process.argv[2] || process.env.TRELLO_USER_TOKEN;

const promiseWithRetry = (fn, ms=10000, maxRetries=5) => new Promise((resolve,reject) => {
    let retries = 0;
    fn()
    .then(resolve)
    .catch(() => {
        setTimeout(() => {
            console.log('retrying failed promise...');
            ++retries;
            if(retries == maxRetries) {
                return reject('maximum retries exceeded');
            }
            promiseWithRetry(fn, ms).then(resolve);
        }, ms);
    })
});

async function get(url, params, headers, identifier) {
  let response;
  try {
    response = await axios.get(url, {
      params: params,
      headers: headers,
    }).catch(function (error) {
      console.log(error.request);
      console.log(`Request error on getting ${identifier}: ${error}`);
    });
  } catch (err) {
    console.log(`Application error on getting ${identifier}: ${err}`);
  };
  return response;
}

async function trelloPost(resource, params, identifier) {
  let response;
  try {
    // Trello has a limit of 100 requests every 10 seconds, we use promiseWithRetry to retry in case one fails
    await promiseWithRetry(async function() {
      response = await axios.post(`${TRELLO_BASE_URL}${resource}`, {},
      {
        params: {
          ...params,
          key: process.env.TRELLO_API_KEY,
          token: TRELLO_USER_TOKEN,
        },
      })
    });
  } catch (err) {
    console.log(`Application error on ${identifier} on trello: ${err}`);
  }
  return response;
};

function discographySorter(a, b) {
  if (a.year != b.year) {
    return (a.year - b.year);
  } else {
    if (a.name < b.name) {return -1;}
    if (a.name > b.name) {return 1;}
    return 0;
  }
};


function processFile() {
  const filePath = process.argv[3] || './discography.txt';

  console.log('Processing file...');

  let discography = fs.readFileSync(filePath, 'utf8').split('\n');

  discography.pop();

  discography = discography.map((disk) => {
    const newElement = disk.match(/^(\d*) (.*)$/).slice(1, 3);
    return {
      year: newElement[0],
      name: newElement[1],
    }
  }).sort(discographySorter);

  let discographyByDecade = [{}];

  discographyByDecade[0][discography[0].year.substring(0, 3)] = []
  discography.forEach((disk) => {
    const currentDecade = disk.year.substring(0, 3);
    if ( Object.keys(discographyByDecade[discographyByDecade.length - 1])[0] === currentDecade) {
      discographyByDecade[discographyByDecade.length - 1][currentDecade].push(disk)
    } else {
      discographyByDecade.push({});

      discographyByDecade[discographyByDecade.length - 1][currentDecade] = [disk];
    }
  });

  return discographyByDecade;
};

async function accessAndAlbumsFromSpotify() {
  console.log('Obtaining album covers from spotify...');

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  // Get the token from spotify
  let response;
  try {
    response = await axios.post(SPOTIFY_TOKEN_URL,
      querystring.stringify({'grant_type':'client_credentials'}),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${encoded}`
        }
      }).catch(function (error) {
        console.log(`Request error on getting token to spotify: ${error}`);
      });
  } catch (err) {
    console.log(`Application error on getting token to spotify: ${err}`);
  }
  const spotifyToken = response.data.access_token;

  // Get albums from spotify
  const artistId = (await get(
    SPOTIFY_SEARCH_URL, {
      q: 'bob dylan',
      type: 'artist',
      limit: 1,
    }, {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    'artist from spotify'
  )).data.artists.items[0].id;

  const firstAlbumsImages = (await get(
    `${SPOTIFY_ARTISTS_URL}/${artistId}/albums`, {
      limit: 50,
    }, {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    'albums from spotify'
  )).data.items;


  const secondAlbumsImages = (await get(
    `${SPOTIFY_ARTISTS_URL}/${artistId}/albums`, {
      limit: 50,
      offset: 50
    }, {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${spotifyToken}`
    },
    'albums from spotify'
  )).data.items;

  const albumsImages  = [...firstAlbumsImages, ...secondAlbumsImages].map((disk) => ({
    year: disk.release_date.substring(0, 4),
    name: disk.name,
    images: disk.images,
  })).sort(discographySorter);


  let imagesByDecade = [{}];
  imagesByDecade[0][albumsImages[0].year.substring(0, 3)] = []

  albumsImages.forEach((disk) => {
    const currentDecade = disk.year.substring(0, 3);
    if ( Object.keys(imagesByDecade[imagesByDecade.length - 1])[0] === currentDecade) {
      imagesByDecade[imagesByDecade.length - 1][currentDecade].push(disk);
    } else {
      imagesByDecade.push({});

      imagesByDecade[imagesByDecade.length - 1][currentDecade] = [disk];
    }
  });

  return { spotifyToken, imagesByDecade };
};

async function createTrelloBoard(discographyByDecade, spotifyToken, imagesByDecade) {
  console.log('Creating board on Trello...');
  const boardId = (await trelloPost(
    'boards', {
      name: "Bob Dylan's discography",
      defaultLists: false,
    },
    'creating board'
  )).data.id;

  const list_requests = [];
  discographyByDecade.forEach(function (decade, decadeIndex) {
    const year = Object.keys(decade)[0];
    list_requests.push(trelloPost(
      'lists', {
        name: `${year}0`,
        idBoard: boardId,
        pos: decadeIndex + 1,
      },
      `creating list for ${year}`
    ).then(function (response) {
      const listId = response.data.id

      const imagesByDecadeIndex = imagesByDecade.findIndex((imageByDecadeElement) => (
        Object.keys(imageByDecadeElement)[0] === year
      ));
      const imageDecade = imagesByDecade[imagesByDecadeIndex];
      const card_requests = [];
      decade[year].forEach(function (disk, diskIndex) {
        card_requests.push(trelloPost(
          'cards', {
            name: `${disk.year} - ${disk.name}`,
            idList: listId,
            pos: diskIndex + 1,
          },
          `creating card for ${disk.name}`
        ).then(function (response) {
          const cardId = response.data.id;

          const imageDecadeIndex = imageDecade[year].findIndex((imageDecadeElement) => (
            new RegExp(`^${disk.name.toLowerCase()}`).test(imageDecadeElement.name.toLowerCase())
          ));

          if (imageDecadeIndex === -1) {
            get(
              SPOTIFY_SEARCH_URL, {
                q: `album:${disk.name} artist:Bob Dylan`,
                type: 'album',
                limit: 1,
              }, {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${spotifyToken}`,
              },
              'cover art from spotify'
            ).then(function (response) {
              const albumFromSpotify = response.data.albums.items;

              if (albumFromSpotify.length > 0) {
                trelloPost(
                  `cards/${cardId}/attachments`, {
                    url: albumFromSpotify[0].images[0].url,
                    setCover: true,
                  },
                  `creating attachment for ${disk.name}`
                );
              }
            });
          } else {
            trelloPost(
              `cards/${cardId}/attachments`, {
                url: imageDecade[year][imageDecadeIndex].images[0].url,
                setCover: true,
              },
              `creating attachment for ${disk.name}`
            );
          }
        }));
      });
      Promise.all(card_requests);
    }));
  });
  Promise.all(list_requests);
};

async function main() {
  console.log('Starting...');

  const discographyByDecade = processFile();

  const { spotifyToken, imagesByDecade } = await accessAndAlbumsFromSpotify();

  createTrelloBoard(discographyByDecade, spotifyToken, imagesByDecade);
};

main().catch(function(error) {
  console.log(`There was a error: ${error}`);
});
