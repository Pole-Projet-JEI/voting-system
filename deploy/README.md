# Event server: https://vote.jeinsat.com on AWS

The event runs on one EC2 server in Milan (`eu-south-1`), m7i.large (2 vCPU / 8 GB). It exists for the 2 days
of the event and is set up with the AWS CLI only. Every AWS resource is tagged `Name=voting`.

```
phones ──HTTPS──> host nginx ──/api/──> backend1 :3000 (Node, one process) ──> mongo (replica set)
                             └──/─────> frontend :3080 (built React site)
```

## Deploys

Every merge to `main` deploys by itself (`.github/workflows/ci-cd.yml`).

- **How:** CI connects over SSH with a key that may only run `deploy/ci-deploy.sh`. That script checks out the merged commit of `main`, runs `docker compose up -d --build`, and waits until the site and the API answer.
- **Logs:** each run is in the repo's Actions tab.

**Don't merge while a vote is open.** A new backend closes the live connections. Pages reconnect within seconds, but a vote sent during the restart fails.

## Admin

- **Username:** `admin`.
- **Password:** on the server only. Run `grep ADMIN_PASSWORD ~/apps/voting-system/server/.env`. The site asks you to change it at the first login.
- **Settings:** all in `server/.env`, which is not in git. After editing it, run `docker compose up -d backend1`.

## Rebuild from scratch (if the server is lost)

1. **Create the server.** Ubuntu 24.04, m7i.large, ports 22/80/443 open, an Elastic IP, and this user data:
   `curl -fsSL https://get.docker.com | sh; apt-get install -y nginx git certbot python3-certbot-nginx; usermod -aG docker ubuntu`
2. **Install the app.** Copy `deploy/setup-server.sh` to the server and run `bash setup-server.sh`. It clones the repo, writes `server/.env` with fresh secrets, tunes nginx for about 2000 live connections, and starts the stack.
3. **DNS:** point the `vote.jeinsat.com` A record to the Elastic IP.
4. **HTTPS:** run `sudo certbot --nginx -d vote.jeinsat.com`. Then turn on HTTP/2: `sudo sed -i 's/listen 443 ssl;/listen 443 ssl http2;/' /etc/nginx/sites-available/vote && sudo systemctl reload nginx`.
5. **CI:**
   - Make a key with `ssh-keygen -t ed25519 -N "" -f ci`.
   - On the server, add this line to `~/.ssh/authorized_keys`:
     `restrict,command="bash /home/ubuntu/apps/voting-system/deploy/ci-deploy.sh" <contents of ci.pub>`.
   - In GitHub, environment `production` (deployments from `main` only), set:
     - the secret `DEPLOY_SSH_KEY` (the contents of `ci`),
     - the variable `DEPLOY_HOST` (the IP),
     - the variable `DEPLOY_KNOWN_HOSTS` (the output of `ssh-keyscan <IP>`).

## After the event

Export the results from the admin page first: the database goes with the server.

```bash
R=eu-south-1
ID=$(aws ec2 describe-instances --region $R --filters Name=tag:Name,Values=voting Name=instance-state-name,Values=running,stopped --query 'Reservations[0].Instances[0].InstanceId' --output text)
aws ec2 terminate-instances --region $R --instance-ids $ID && aws ec2 wait instance-terminated --region $R --instance-ids $ID
aws ec2 release-address --region $R --allocation-id $(aws ec2 describe-addresses --region $R --filters Name=tag:Name,Values=voting --query 'Addresses[0].AllocationId' --output text)
aws ec2 delete-security-group --region $R --group-id $(aws ec2 describe-security-groups --region $R --filters Name=group-name,Values=voting --query 'SecurityGroups[0].GroupId' --output text)
aws ec2 delete-key-pair --region $R --key-name voting
```

Then delete the GitHub variable `DEPLOY_HOST`, so CI stops trying to deploy.
