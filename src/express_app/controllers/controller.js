const MySQL = require('mysql')
const Controller = {}

let databaseName = process.argv.slice(2, 3) + ''

if (databaseName.length < 1) databaseName = 'webadmin'

const connection = MySQL.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'root'
})

// Init
;(function () {
  try {
    connection.connect((err) => {
      if (err) throw err

      connection.query(`CREATE DATABASE IF NOT EXISTS ${databaseName}`, (err, result) => {
        if (err) throw err

        connection.changeUser({ user: 'root', database: databaseName }, (err, result) => {
          if (err) throw err
          console.log(`Connected to database '${databaseName}'`)
          createTables()
        })
      })
    })
  } catch (error) {
    console.log('MySQL error, could not create connection!')
    process.exit()
  }
})()

function createTables() {
  let initAlbums = `CREATE TABLE IF NOT EXISTS albums (
    id INT NOT NULL AUTO_INCREMENT, 
    price INT NOT NULL, 
    in_stock BOOL NOT NULL, 
    name VARCHAR(255) NOT NULL, 
    artist VARCHAR(255) NOT NULL, 
    release_date DATE NOT NULL,
    PRIMARY KEY (id)
    )`

  let initSongs = `CREATE TABLE IF NOT EXISTS songs (
    id INT NOT NULL AUTO_INCREMENT,
    album_id INT, 
    title VARCHAR(255) NOT NULL, 
    length INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (album_id) REFERENCES albums(id)
    )`

  let initUsers = `CREATE TABLE IF NOT EXISTS users (
    id INT NOT NULL AUTO_INCREMENT, 
    name VARCHAR(255) NOT NULL, 
    password VARCHAR(255) NOT NULL, 
    email VARCHAR(255) NOT NULL,
    PRIMARY KEY (id)
    )`

  let initOrders = `CREATE TABLE IF NOT EXISTS orders (
    id INT NOT NULL,
    user_id INT, 
    album_id INT, 
    order_date DATETIME NOT NULL, 
    ship_status VARCHAR(255) NOT NULL, 
    payed_status BOOL NOT NULL, 
    quantity INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (album_id) REFERENCES albums(id)
    )`

  // Create all tables one after the other
  connection.query(initAlbums, (err, result) => {
    if (err) throw err
    connection.query(initSongs, (err, result) => {
      if (err) throw err
      connection.query(initUsers, (err, result) => {
        if (err) throw err
        connection.query(initOrders, (err, result) => {
          if (err) throw err
          // When all tables have been created, start inserting data

          // First check for empty table
          connection.query(`SELECT EXISTS(SELECT 1 FROM orders) as empty`, (err, result) => {
            if (err) throw err

            let emptyDB = true
            if (result[0].empty === 1) emptyDB = false

            // If the database (specifically orders table) is empty, init all tables with data
            if (emptyDB) {
              let tables = ['albums', 'songs', 'users', 'orders']
              for (const e of tables) {
                let query = `LOAD DATA LOCAL INFILE '${e}.csv' INTO TABLE ${e} FIELDS TERMINATED BY ',' ENCLOSED BY '"' LINES TERMINATED BY '\r\n'`

                connection.query(query, (err, result) => {
                  if (err) throw err
                })
              }
            }

            // Finally, create views
            let view1 = `CREATE OR REPLACE VIEW highestSpenders AS 
                              SELECT users.id, users.name, users.email,
                              (SELECT SUM(orders.quantity * 
                                            (SELECT albums.price 
                                             FROM albums 
                                             WHERE albums.id = orders.album_id))
                               FROM orders
                               WHERE users.id = orders.user_id) as amount_spent
                            FROM users
                            ORDER BY amount_spent DESC
                            LIMIT 3`
            connection.query(view1, (err, result) => {
              if (err) throw err
            })
          })
        })
      })
    })
  })
}

Controller.listUsers = (req, res) => {
  const usersQuery = `SELECT users.id, users.name, users.email, 
  (SELECT SUM(orders.quantity)
   FROM orders
   WHERE orders.user_id = users.id) as num_of_albums_ordered 
  FROM users`

  const spendersQuery = `SELECT name, amount_spent FROM highestspenders`

  connection.query(usersQuery, (err, result) => {
    for (const e of result) {
      if (e.num_of_albums_ordered === null) e.num_of_albums_ordered = 0
    }

    connection.query(spendersQuery, (err, result2) => {
      res.render('list_users', {
        title: 'Listings: Users',
        data: result,
        data_spenders: result2
      })
    })
  })
}

Controller.listAlbums = (req, res) => {
  listAlbums(res)
}

function listAlbums(res, sort_opt) {
  let query = `SELECT id, name, artist, price, in_stock, release_date,
    (SELECT COUNT(id) 
     FROM songs 
     WHERE albums.id = album_id) as num_of_songs
     FROM albums`

  if (sort_opt) query += ` ORDER BY price ${sort_opt}`

  connection.query(query, (err, result) => {
    let totalSongs = 0
    for (let i = 0; i < result.length; i++) {
      let e = result[i]
      // fix boolean (0 = true, 1 = false)
      e.in_stock ? (e.in_stock = 'Yes') : (e.in_stock = 'No')

      // fix date print
      const offset = e.release_date.getTimezoneOffset()
      e.release_date = new Date(e.release_date.getTime() - offset * 60 * 1000)
        .toISOString()
        .split('T')[0]

      // count for avg num of songs
      totalSongs += e.num_of_songs
    }

    let avgNumOfSongs = totalSongs / result.length

    const queryAvgPrice = `SELECT AVG(albums.price) AS Average_Cost_Albums FROM albums`
    connection.query(queryAvgPrice, (err, result2) => {
      res.render('list_albums', {
        title: 'Listings: Albums',
        data: result,
        avg_price: result2[0].Average_Cost_Albums,
        avg_songs: avgNumOfSongs
      })
    })
  })
}

Controller.listOrders = (req, res) => {
  listOrders(res)
}

function listOrders(res, userID) {
  let query = 'SELECT * FROM orders'

  if (userID) query += ` WHERE user_id = ${userID}`

  connection.query(query, (err, result) => {
    for (let i = 0; i < result.length; i++) {
      let e = result[i]
      // fix date print
      // fix boolean (0 = true, 1 = false)
      e.payed_status ? (e.payed_status = 'Payed') : (e.payed_status = 'Not Payed')
      const offset = e.order_date.getTimezoneOffset()
      e.order_date = new Date(e.order_date.getTime() - offset * 60 * 1000)
        .toISOString()
        .slice(0, 19)
        .replace(/T/g, ' ')
    }
    res.render('list_orders', {
      title: 'Listings: Orders',
      data: result,
      userID: userID
    })
  })
}

Controller.listSongs = (req, res) => {
  listSongs(res)
}

function listSongs(res, albumID) {
  let query = `SELECT songs.id, songs.title, songs.length, albums.artist, albums.name AS album_name, songs.album_id
  FROM albums
  INNER JOIN songs
  ON albums.id = songs.album_id
  ORDER BY songs.album_id ASC, songs.id ASC`

  if (albumID) {
    query = `SELECT songs.id, songs.title, songs.length, albums.artist, albums.name AS album_name, songs.album_id
    FROM albums
    INNER JOIN songs
    ON albums.id = songs.album_id
    WHERE albums.id = ${albumID}
    ORDER BY songs.album_id ASC, songs.id ASC`
  }

  connection.query(query, (err, result) => {
    for (let i = 0; i < result.length; i++) {
      let e = result[i]
      if (e) e.length = new Date(e.length * 1000).toISOString().substr(14, 5)
    }
    res.render('list_songs', {
      title: 'Listings: Songs',
      data: result,
      albumID: albumID
    })
  })
}

Controller.renderIndex = (req, res) => {
  res.render('index', {
    title: 'Index'
  })
}

Controller.renderCreateAlbum = (req, res) => {
  if (req.params.id) {
    update = true

    connection.query(`SELECT * FROM albums WHERE id = ${req.params.id}`, (err, result) => {
      if (err) throw err

      let checkBoxChecked = false
      if (result[0].in_stock === 1) checkBoxChecked = true

      // fix date print
      const offset = result[0].release_date.getTimezoneOffset()
      result[0].release_date = new Date(result[0].release_date.getTime() - offset * 60 * 1000)
        .toISOString()
        .split('T')[0]

      res.render('create_update', {
        title: 'Update an Album',
        album: true,
        update: true,
        data: result[0],
        checked: checkBoxChecked
      })
    })
  } else {
    res.render('create_update', {
      title: 'Add a new Album',
      album: true,
      update: false
    })
  }
}

Controller.renderCreateSong = (req, res) => {
  if (req.params.id) {
    update = true

    connection.query(`SELECT * FROM songs WHERE id = ${req.params.id}`, (err, result) => {
      if (err) throw err

      res.render('create_update', {
        title: 'Update a Song',
        song: true,
        update: true,
        data: result[0]
      })
    })
  } else {
    res.render('create_update', {
      title: 'Add a new Song',
      song: true,
      update: false
    })
  }
}

Controller.renderUpdate = (req, res) => {
  // TODO
}

Controller.updateRow = (req, res) => {
  // TODO
}

Controller.updateSong = (req, res) => {
  const query = `UPDATE songs 
      SET album_id = ${req.body.album_id}, title = "${req.body.title}", length =${req.body.length}
      WHERE id = ${req.params.id}`

  connection.query(query, (err, result) => {
    if (err) {
      console.log(err)
      res.render('create_update', {
        title: 'Update a Song',
        status: 'Could not update song!',
        song: true,
        update: true,
        error: true
      })
    } else {
      res.render('create_update', {
        title: 'Update a Song',
        status: 'Song updated!',
        song: true,
        update: true,
        data: req.body
      })
    }
  })
}

Controller.createSong = (req, res) => {
  // check for duplicate first
  const duplicateCheck = `SELECT COUNT(title) as count FROM songs WHERE album_id = "${req.body.album_id}" AND title = "${req.body.title}"`
  connection.query(duplicateCheck, (err, result) => {
    if (err) {
      console.log(err)
      return
    } else if (result[0].count > 0) {
      res.render('create_update', {
        title: 'Add new Song',
        status: 'Song already exists!',
        song: true,
        error: true
      })
    } else {
      // if no dupe, insert new song
      const query = `INSERT INTO songs (album_id, title, length) VALUES (${req.body.album_id}, "${req.body.title}", ${req.body.length})`
      connection.query(query, (err, result) => {
        if (err) {
          res.render('create_update', {
            title: 'Add new Song',
            status: 'Incorrect album id!',
            song: true,
            error: true
          })
        } else {
          res.render('create_update', {
            title: 'Add new Song',
            status: 'Song added!',
            song: true
          })
        }
      })
    }
  })
}

Controller.updateAlbum = (req, res) => {
  let checkBoxChecked = false
  if (req.body.in_stock === 1) checkBoxChecked = true

  let stock = 0
  if (req.body.in_stock) stock = 1

  const query = `UPDATE albums 
  SET price = ${req.body.price}, in_stock = ${stock}, name = "${req.body.name}", artist = "${req.body.artist}", release_date = "${req.body.release_date}"
  WHERE id = ${req.params.id}`

  connection.query(query, (err, result) => {
    if (err) {
      console.log(err)
      res.render('create_update', {
        title: 'Update an Album',
        status: 'Could not update album!',
        album: true,
        update: true,
        error: true,
        checked: checkBoxChecked
      })
    } else {
      res.render('create_update', {
        title: 'Update an Album',
        status: 'Song updated!',
        album: true,
        update: true,
        data: req.body,
        checked: checkBoxChecked
      })
    }
  })
}

Controller.createAlbum = (req, res) => {
  let stock
  req.body.in_stock ? (stock = 1) : (stock = 0)
  // check for duplicate first
  const duplicateCheck = `SELECT COUNT(name) as count FROM albums WHERE name = "${req.body.name}" AND artist = "${req.body.artist}"`
  connection.query(duplicateCheck, (err, result) => {
    if (err) {
      console.log(err)
      return
    } else if (result[0].count > 0) {
      res.render('create_update', {
        title: 'Add new Album',
        status: 'Album already exists!',
        album: true,
        error: true
      })
    } else {
      // if no dupe, insert new album
      const query = `INSERT INTO albums (price, in_stock, name, artist, release_date) VALUES (${req.body.price}, ${stock}, "${req.body.name}", "${req.body.artist}", "${req.body.release_date}")`
      connection.query(query, (err, result) => {
        if (err) {
          console.log(err)
          res.render('create_update', {
            title: 'Add new Album',
            status: 'An error occured',
            album: true,
            error: 'An error occured!'
          })
        } else {
          res.render('create_update', {
            title: 'Add new Album',
            status: 'Album added!',
            album: true
          })
        }
      })
    }
  })
}

Controller.handleAlbumsPost = (req, res) => {
  if (req.body.sort_opt) {
    if (req.body.sort_opt === 'ID') Controller.listAlbums(req, res)
    else listAlbums(res, req.body.sort_opt)
  } else Controller.listAlbums(req, res)
}

Controller.handleOrdersPost = (req, res) => {
  if (req.body.user_id) {
    if (req.body.user_id.length > 0) listOrders(res, req.body.user_id)
    else Controller.listOrders(req, res)
  } else Controller.listOrders(req, res)
}

Controller.handleSongsPost = (req, res) => {
  if (req.body.album_id) {
    if (req.body.album_id.length > 0) listSongs(res, req.body.album_id)
    else Controller.listSongs(req, res)
  } else Controller.listSongs(req, res)
}

module.exports = Controller
