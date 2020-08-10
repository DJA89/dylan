// First argument the user credentials
// Second optional argument discography relative file path


const axios = require('axios').default;
const  querystring = require('querystring');
require('dotenv').config();

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_ALBUMS_URL = 'https://api.spotify.com/v1/albums';
const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';
const SPOTIFY_ARTISTS_URL = 'https://api.spotify.com/v1/artists';
const TRELLO_BASE_URL = 'https://api.trello.com/1/';

async function get(url, params, headers, identifier) {
  let response;
  try {
    response = await axios.get(url, {
        params: params,
       headers: headers,
     }).catch(function (error) {
       console.log(error.request);
       console.log(`Request error on getting ${identifier}: ${error}`)
     });
  } catch (err) {
    console.log(`Application error on getting ${identifier}: ${err}`);
  };
  return response;
}

async function trello_post(resource, params, identifier) {
  let response;
  try {
    response = await axios.post(`${TRELLO_BASE_URL}${resource}`, {},
         {
           params: {
             ...params,
             key: process.env.TRELLO_API_KEY,
             token: process.env.TRELLO_USER_TOKEN,
           },
         }).catch(function (error) {
           console.log(`Request error on ${identifier} on trello : ${error}`)
         });
  } catch (err) {
    console.log(`Application error on ${identifier} on trello: ${err}`);
  }
  return response;
};

function sorter(a, b) {
  if (a.year != b.year) {
    return (a.year - b.year);
  } else {
    if (a.name < b.name) {return -1;}
    if (a.name > b.name) {return 1;}
    return 0;
  }
};

async function main() {
  console.log('Starting...');
  const our_path = process.argv[1];
  const credentials = process.argv[2] || process.env.TRELLO_USER_TOKEN;
  const file_path = process.argv[3] || 'discography.txt';

  fs = require('fs');

  console.log('Processing file...');
  const discography_path = `${our_path.replace(/\/[^\/]*$/, '')}/${file_path}`;

  let discography = fs.readFileSync(discography_path, 'utf8').split('\n')

  discography.pop()

  discography = discography.map((disk) => {
    const new_element = disk.match(/^(\d*) (.*)$/).slice(1, 3);
    return {
      year: new_element[0],
      name: new_element[1],
    }
  }).sort(sorter);

  let discography_by_decade = [{}];

  discography_by_decade[0][discography[0].year.substring(0, 3)] = []
  discography.forEach((disk) => {
    const current_decade = disk.year.substring(0, 3);
    if ( Object.keys(discography_by_decade[discography_by_decade.length - 1])[0] == current_decade) {
      discography_by_decade[discography_by_decade.length - 1][current_decade].push(disk)
    } else {
      discography_by_decade.push({});

      discography_by_decade[discography_by_decade.length - 1][current_decade] = [disk];
    }
  });

  console.log('Obtaining album covers from spotify...');

  const client_id = process.env.SPOTIFY_CLIENT_ID;
  const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
  const encoded = Buffer.from(`${client_id}:${client_secret}`).toString('base64');

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
           console.log(`Request error on getting token to spotify: ${error}`)
         });
  } catch (err) {
    console.log(`Application error on getting token to spotify: ${err}`);
  }
  const spotify_token = response.data.access_token;

  // Get albums from spotify
  const artist_id = (await get(
                      SPOTIFY_SEARCH_URL, {
                        q: 'bob dylan',
                        type: 'artist',
                        limit: 1,
                      }, {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${spotify_token}`
                      },
                      'artist from spotify'
                    )).data.artists.items[0].id;

  const first_albums_images = (await get(
                                `${SPOTIFY_ARTISTS_URL}/${artist_id}/albums`, {
                                  limit: 50,
                                }, {
                                  'Accept': 'application/json',
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${spotify_token}`
                                },
                                'albums from spotify'
                              )).data.items;


  const second_albums_images = (await get(
                                `${SPOTIFY_ARTISTS_URL}/${artist_id}/albums`, {
                                  limit: 50,
                                  offset: 50
                                }, {
                                  'Accept': 'application/json',
                                  'Content-Type': 'application/json',
                                  'Authorization': `Bearer ${spotify_token}`
                                },
                                'albums from spotify'
                              )).data.items;

  const albums_images  = [...first_albums_images, ...second_albums_images].map((disk) => ({
      year: disk.release_date.substring(0, 4),
      name: disk.name,
      images: disk.images
    })).sort(sorter);


  let images_by_decade = [{}];
  images_by_decade[0][albums_images[0].year.substring(0, 3)] = []

  albums_images.forEach((disk) => {
    const current_decade = disk.year.substring(0, 3);
    if ( Object.keys(images_by_decade[images_by_decade.length - 1])[0] == current_decade) {
      images_by_decade[images_by_decade.length - 1][current_decade].push(disk)
    } else {
      images_by_decade.push({});

      images_by_decade[images_by_decade.length - 1][current_decade] = [disk];
    }
  });

  console.log('Creating board on Trello...');
  const board_id = (await trello_post(
    'boards', {
      name: "Bob Dylan's discography",
      defaultLists: false,
    },
    'creating board'
  )).data.id;

  let images_by_decade_index = 0;
  for (let discography_by_decade_index = 0; discography_by_decade_index < discography_by_decade.length; discography_by_decade_index++) {
    const decade = discography_by_decade[discography_by_decade_index];
    const year = Object.keys(decade)[0];
    const list_id = (await trello_post(
      'lists', {
        name: `${year}0`,
        idBoard: board_id,
        pos: 'bottom',
      },
      `creating list for ${year}`
    )).data.id;

    while (Object.keys(images_by_decade[images_by_decade_index])[0] != year) {
      ++images_by_decade_index;
    };
    const image_decade = images_by_decade[images_by_decade_index];

    let image_decade_index = 0;
    for (let decade_index = 0; decade_index < decade[year].length; decade_index++) {
      const disk = decade[year][decade_index];
      const card_id = (await trello_post(
        'cards', {
          name: `${disk.year} - ${disk.name}`,
          idList: list_id,
        },
        `creating card for ${disk.name}`
      )).data.id;

      const image_decade_previous_index = image_decade_index;
      let found = false;

      while (image_decade_index < image_decade[year].length && !(new RegExp(`${disk.name.toLowerCase()}`).test(image_decade[year][image_decade_index].name.toLowerCase()))) {
        ++image_decade_index;
      };

      if (image_decade_index >= image_decade[year].length) {
        image_decade_index = image_decade_previous_index;
      } else {
        trello_post(
          `cards/${card_id}/attachments`, {
            url: image_decade[year][image_decade_index].images[0].url,
            setCover: true,
          },
          `creating attachment for ${disk.name}`
        );
      }
    };
  };
  console.log('Finished!');
};

main().catch(function(error) {
  console.log(`There was a error: ${error}`);
});
