const HTTPError = require('http-errors')
const Express = require('express')
const Path = require('path')

// Init DB

const App = Express()
const routesPrefix = Path.join(__dirname, 'routes')

// View engine setup
App.set('views', Path.join(__dirname, 'views'))
App.set('view engine', 'hbs')

// App middleware setup
App.use(Express.json())
App.use(Express.urlencoded({ extended: false }))
App.use(Express.static(Path.join(__dirname, 'public')))

// Routers & routes setup
const indexRouter = require(Path.join(routesPrefix, 'index'))
// const createRouter = require(Path.join(routesPrefix, 'create'))
// const updateDeleteRouter = require(Path.join(routesPrefix, 'update-delete'))

// App.use('/create', createRouter)
// App.use('/edit', updateDeleteRouter)
App.use('/', indexRouter)

// Catch 404 and forward to error handler
App.use((req, res, next) => {
  next(HTTPError(404))
})

// Error handler
App.use((err, req, res, next) => {
  // set locals, only providing error in development
  res.locals.message = err.message
  res.locals.error = req.app.get('env') === 'development' ? err : {}

  res.status(err.status || 500)
  res.render('error', {
    title: 'Error'
  })
})

module.exports = App
