var express = require("express");
var path = require("path");
var OAuth = require('oauth').OAuth;
var bodyParser = require('body-parser');
var mongo = require('mongodb');

var myDBClient = mongo.MongoClient;
var myDBUrl = process.env.mongodb_url;

var objectId = mongo.ObjectID;
var oauth = new OAuth(
    "https://api.twitter.com/oauth/request_token",
    "https://api.twitter.com/oauth/access_token",
     process.env.twitter_consumer_key,
     process.env.twitter_consumer_secret,
    "1.0",
     process.env.twitter_callback_url,
    "HMAC-SHA1");


var app = express();
app.use(express.static(path.resolve(__dirname, 'views')));
app.use(express.cookieParser(process.env.cookie_secret_key));
app.use(express.session());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.set('view engine', 'ejs');

//HOME PAGE 
app.get("/polls", function(req, res) {
    retrieveAllPolls(req, res, {});
});
// TWITTER AUTH JOB
app.get('/signin', function(req, res) {
    if (!req.session.user) {
        oauth.getOAuthRequestToken(function(error, oauth_token, oauth_token_secret, results) {
            if (error) {
                console.log(error);
                res.send("Authentication Failed!");
            }
            else {
                req.session.oauth = {
                    token: oauth_token,
                    token_secret: oauth_token_secret
                };
                res.redirect('https://twitter.com/oauth/authenticate?oauth_token=' + oauth_token);
            }
        });
    }
    else {
        res.redirect('/polls');
    }
});

//TWITTER RESPONSE
app.get('/signin/callback', function(req, res, next) {

    if (req.session.oauth) {
        req.session.oauth.verifier = req.query.oauth_verifier;
        var oauth_data = req.session.oauth;

        oauth.getOAuthAccessToken(
            oauth_data.token,
            oauth_data.token_secret,
            oauth_data.verifier,
            function(error, oauth_access_token, oauth_access_token_secret, results) {
                if (error) {
                    console.log(error);
                    res.send("Authentication Failure!");
                }
                else {
                    req.session.oauth.access_token = oauth_access_token;
                    req.session.oauth.access_token_secret = oauth_access_token_secret;
                    req.session.twitterId = results.user_id;
                    req.session.twitterUser = results.screen_name;
                    res.send("Authentication Successful");
                    res.redirect('/mypolls');
                }
            }
        );
    }
    else {
        res.redirect('/polls');
    }
});
//TWITTER SIGNOUT
app.get("/signout", function(req, res) {
    req.session.destroy();
    res.redirect("/polls");
});
//USER POLLS
app.get("/mypolls", function(req, res) {
    if (!req.session.twitterUser) {
        res.redirect("/polls");
    }
    else {
        retrieveAllPolls(req, res, {
            "polluser": req.session.twitterUser
        });
    }
});
//CREATE NEW POLL
app.get("/newpoll", function(req, res) {
    if (!req.session.twitterUser) {
        res.redirect("/polls");
    }
    else {
        res.render("index", {
            btnText: req.session.twitterUser,
            btnAddr: "/signout",
            btnArr: [{
                first: "My Polls",
                second: "/mypolls"
            }, {
                first: "New Poll",
                second: "/newpoll"
            }],
            voteActv: 2,
        });
    }
});
//GET NEW POLL PARAMS
app.post("/newpoll", function(req, res) {
    insertPoll(req, res);
});
//SHOW CHOSEN POLL
app.get("/polls/:id", function(req, res) {
    var tempStr = req.params.id.toString();

    retrievePoll(req, res, {
        "_id": objectId(tempStr)
    }, 0);

});
//GET POLLING PARAMS
app.post("/polls/:id", function(req, res) {

    if (JSON.stringify(req.body) != "{}")
        if (req.body.custOpt)
            updateOption(req, res);
        else
            findUserorIp(req, res);
    else
        deletePoll(req, res);

});

app.listen(process.env.PORT || 3000, process.env.IP || "0.0.0.0");


function retrievePoll(req, res, query, alertFlag) {
    var tmpParam = [];
    var tmpTitle = "";
    myDBClient.connect(myDBUrl, function(err, db) {
        if (err) {
            console.log(err);
        }
        var myCol = db.collection('pollstest');
        myCol.find(query).toArray(function(err, result) {
            if (err) console.log("err");
            else if (result.length) {
                tmpTitle = result[0].title;
                tmpParam = result[0].paramNum;
                if (alertFlag == 2) {
                    if (!req.session.twitterUser) {
                        res.render("index", {
                            btnText: "Sign in with Twitter",
                            btnAddr: "/signin",
                            voteActv: 1,
                            alertFlag: 0,
                            chartDep: [{
                                fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                pageUrl: "/polls/" + req.params.id.toString(),
                                chartTitle: tmpTitle,
                                data: tmpParam
                            }]
                        });
                    }
                    else {
                        if (result[0].polluser == req.session.twitterUser) {
                            res.render("index", {
                                btnText: req.session.twitterUser,
                                btnAddr: "/signout",
                                btnArr: [{
                                    first: "My Polls",
                                    second: "/mypolls"
                                }, {
                                    first: "New Poll",
                                    second: "/newpoll"
                                }],
                                voteActv: 1,
                                alertFlag: 0,
                                deleteFlag: 1,
                                chartDep: [{
                                    fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                    pageUrl: "/polls/" + req.params.id.toString(),
                                    chartTitle: tmpTitle,
                                    data: tmpParam
                                }]
                            });
                        }
                        else {
                            res.render("index", {
                                btnText: req.session.twitterUser,
                                btnAddr: "/signout",
                                btnArr: [{
                                    first: "My Polls",
                                    second: "/mypolls"
                                }, {
                                    first: "New Poll",
                                    second: "/newpoll"
                                }],
                                voteActv: 1,
                                alertFlag: 0,
                                addFlag: 1,
                                chartDep: [{
                                    fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                    pageUrl: "/polls/" + req.params.id.toString(),
                                    chartTitle: tmpTitle,
                                    data: tmpParam
                                }]
                            });
                        }
                    }
                }
                else if (alertFlag == 1) {
                    if (!req.session.twitterUser) {
                        res.render("index", {
                            btnText: "Sign in with Twitter",
                            btnAddr: "/signin",
                            voteActv: 1,
                            alertFlag: 1,
                            chartDep: [{
                                fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                pageUrl: "/polls/" + req.params.id.toString(),
                                chartTitle: tmpTitle,
                                data: tmpParam
                            }]
                        });
                    }
                    else {
                        if (result[0].polluser == req.session.twitterUser) {
                            res.render("index", {
                                btnText: req.session.twitterUser,
                                btnAddr: "/signout",
                                btnArr: [{
                                    first: "My Polls",
                                    second: "/mypolls"
                                }, {
                                    first: "New Poll",
                                    second: "/newpoll"
                                }],
                                voteActv: 1,
                                alertFlag: 1,
                                deleteFlag: 1,
                                addFlag: 1,
                                chartDep: [{
                                    fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                    pageUrl: "/polls/" + req.params.id.toString(),
                                    chartTitle: tmpTitle,
                                    data: tmpParam
                                }]
                            });
                        }
                        else {
                            res.render("index", {
                                btnText: req.session.twitterUser,
                                btnAddr: "/signout",
                                btnArr: [{
                                    first: "My Polls",
                                    second: "/mypolls"
                                }, {
                                    first: "New Poll",
                                    second: "/newpoll"
                                }],
                                voteActv: 1,
                                alertFlag: 1,
                                addFlag: 1,
                                chartDep: [{
                                    fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                    pageUrl: "/polls/" + req.params.id.toString(),
                                    chartTitle: tmpTitle,
                                    data: tmpParam
                                }]
                            });
                        }
                    }
                }
                else {
                    if (!req.session.twitterUser) {
                        res.render("index", {
                            btnText: "Sign in with Twitter",
                            btnAddr: "/signin",
                            voteActv: 1,
                            chartDep: [{
                                fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                pageUrl: "/polls/" + req.params.id.toString(),
                                chartTitle: tmpTitle,
                                data: tmpParam
                            }]
                        });
                    }
                    else {
                        if (result[0].polluser == req.session.twitterUser) {
                            res.render("index", {
                                btnText: req.session.twitterUser,
                                btnAddr: "/signout",
                                btnArr: [{
                                    first: "My Polls",
                                    second: "/mypolls"
                                }, {
                                    first: "New Poll",
                                    second: "/newpoll"
                                }],
                                voteActv: 1,
                                deleteFlag: 1,
                                addFlag: 1,
                                chartDep: [{
                                    fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                    pageUrl: "/polls/" + req.params.id.toString(),
                                    chartTitle: tmpTitle,
                                    data: tmpParam
                                }]
                            });
                        }
                        else {
                            res.render("index", {
                                btnText: req.session.twitterUser,
                                btnAddr: "/signout",
                                btnArr: [{
                                    first: "My Polls",
                                    second: "/mypolls"
                                }, {
                                    first: "New Poll",
                                    second: "/newpoll"
                                }],
                                addFlag: 1,
                                voteActv: 1,
                                chartDep: [{
                                    fullUrl: req.headers["x-forwarded-proto"].toString() + "://" + req.headers.host.toString(),
                                    pageUrl: "/polls/" + req.params.id.toString(),
                                    chartTitle: tmpTitle,
                                    data: tmpParam
                                }]
                            });
                        }
                    }
                }
            }


        });
        db.close();
    });

}

function retrieveAllPolls(req, res, query) {
    var buttonObj = [];
    myDBClient.connect(myDBUrl, function(err, db) {
        if (err) {
            console.log(err);
        }
        var myCol = db.collection('pollstest');
        myCol.find(query).toArray(function(err, result) {
            if (err) console.log("err");
            else if (result.length) {
                for (var i = 0; i < result.length; i++) {
                    buttonObj.push({
                        name: result[i].title.toString(),
                        addr: "/polls/" + result[i]._id.toString()
                    });
                }
                if (!req.session.twitterUser) {
                    res.render("index", {
                        btnText: "Sign in with Twitter",
                        btnAddr: "/signin",
                        bodyBtn: buttonObj
                    });
                }
                else {
                    res.render("index", {
                        btnText: req.session.twitterUser,
                        btnAddr: "/signout",
                        btnArr: [{
                            first: "My Polls",
                            second: "/mypolls"
                        }, {
                            first: "New Poll",
                            second: "/newpoll"
                        }],
                        bodyBtn: buttonObj
                    });
                }
            }
            else {
                if (!req.session.twitterUser) {
                    res.render("index", {
                        btnText: "Sign in with Twitter",
                        btnAddr: "/signin"
                    });
                }
                else {
                    res.render("index", {
                        btnText: req.session.twitterUser,
                        btnAddr: "/signout",
                        btnArr: [{
                            first: "My Polls",
                            second: "/mypolls"
                        }, {
                            first: "New Poll",
                            second: "/newpoll"
                        }]
                    });
                }
            }

        });
        db.close();
    });

}

function insertPoll(req, res) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    var myParam = req.body.options.trim().replace(/^\s*\n/gm, "").split(/\r/g).filter(function(element, index, arr) {
        return arr.indexOf(element) == index;
    }).map(function(elem) {
        return {
            name: elem,
            point: 0
        };
    });



    myDBClient.connect(myDBUrl, function(err, db) {
        if (err)
            console.log('Unable to connect to the mongoDB server. Error:', err);
        else {
            var myCol = db.collection('pollstest');

            myCol.insert({
                title: req.body.title,
                polluser: req.session.twitterUser,
                userIp: ip,
                votingUser: [],
                votingIP: [],
                paramNum: myParam,

            }, function(error, response) {
                if (error)
                    console.log(error);
                var myID = response.ops[0]._id;
                res.redirect("/polls/" + myID);
                db.close();
            });
        }
    });
}

function updatePoll(req, res, flag) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    myDBClient.connect(myDBUrl, function(err, db) {
        if (err) {
            console.log(err);
        }
        var myCol = db.collection('pollstest');
        if (flag) {
            myCol.update({
                    "_id": objectId(req.params.id.toString()),
                    "paramNum.name": req.body.option.toString()
                }, {
                    $inc: {
                        "paramNum.$.point": 1
                    },
                    $addToSet: {
                        "votingUser": req.session.twitterUser
                    }
                },
                false,
                true);
            retrievePoll(req, res, {
                "_id": objectId(req.params.id.toString())
            }, 2);
        }
        else {
            myCol.update({
                    "_id": objectId(req.params.id.toString()),
                    "paramNum.name": req.body.option.toString()
                }, {
                    $inc: {
                        "paramNum.$.point": 1
                    },
                    $addToSet: {
                        "votingIP": ip
                    }
                },
                false,
                true);
            retrievePoll(req, res, {
                "_id": objectId(req.params.id.toString())
            }, 2);
        }
        db.close();
    });
}

function updateOption(req, res) {

    myDBClient.connect(myDBUrl, function(err, db) {
        if (err) {
            console.log(err);
        }
        var myCol = db.collection('pollstest');

        myCol.update({
                "_id": objectId(req.params.id.toString())
            }, {
                $addToSet: {
                    "paramNum": {
                        "name": req.body.custOpt,
                        "point": 1
                    }
                }
            },
            false,
            true);
        retrievePoll(req, res, {
            "_id": objectId(req.params.id.toString())
        }, 2);
        db.close();
    });
}


function deletePoll(req, res) {
    myDBClient.connect(myDBUrl, function(err, db) {
        if (err) {
            console.log(err);
        }
        db.collection('pollstest').remove({
            "_id": objectId(req.params.id.toString())
        });
        res.redirect("/polls");
        db.close();
    });
}

function findUserorIp(req, res) {
    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    myDBClient.connect(myDBUrl, function(err, db) {
        if (err) {
            console.log(err);
        }
        var mycoll = db.collection('pollstest');

        if (!req.session.twitterUser) {
            mycoll.find({
                "_id": objectId(req.params.id.toString()),
                "votingIP": ip.toString()
            }).toArray(function(err, result) {
                if (err) console.log("err");
                else if (result.length) {
                    retrievePoll(req, res, {
                        "_id": objectId(req.params.id.toString())
                    }, 1);
                }
                else {
                    updatePoll(req, res, false);
                }
            });
        }
        else {
            mycoll.find({
                "_id": objectId(req.params.id.toString()),
                "votingUser": req.session.twitterUser.toString()

            }).toArray(function(err, result) {
                if (err) console.log("err");
                else if (result.length) {
                    retrievePoll(req, res, {
                        "_id": objectId(req.params.id.toString())
                    }, 1);
                }
                else {
                    updatePoll(req, res, true);
                }
            });

        }
        db.close();
    });
}
