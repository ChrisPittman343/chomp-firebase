**Express requests**

# Any Auth (Signed in)

## get-class-initial

Get some initial info about a class. This method should be intentionally light, should a user only need some basic info about a class
Could also be done with some firestore security rules
**PARAMS**: ClassId
**RETRUN**: ChannelNames, Some messages from popular channels (Paginate)

# Teacher / Assistant Auth

## get-taught-classes

Simply return the basic classroom info recieved from CAPI
Probably fine to get all classes, since a teacher can only have so many active classes in reality

## create-class

**PARAMS**: ClassId

## get-participation-stats

Explicit request from a teacher to build participation stats for a class
Hopefully, this isn't called much, since it would entail checking all channel message logs and stuff
Regardless, it'd be a good idea to save the stats, so you could check if the stats are stale or not to limit work on the server
**RETURN**:

## get-anonymous-message

Explicit request from a teacher to view an anonymous message
Might be a good idea to email the sender so they know if a teacher is checking their stuff
**PARAMS**: MessageId
**RETURN**: Message sender's info
