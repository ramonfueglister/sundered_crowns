#!/bin/sh
# Mirror the source tree (without node_modules/build output) to the shared project folder.
mkdir -p /mnt/project-files/sundered-crowns/
cd /home/user/sundered-crowns && tar --exclude=node_modules --exclude=dist --exclude=.git -czf /tmp/sc-backup.tgz . && cp /tmp/sc-backup.tgz /mnt/project-files/sundered-crowns/sundered-crowns-src.tgz && echo backed up $(du -h /tmp/sc-backup.tgz | cut -f1)
