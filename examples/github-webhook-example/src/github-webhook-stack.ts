import { RestApi } from '@aws-cdk/aws-apigateway';
import { App, Stack, StackProps } from '@aws-cdk/core';
import { GithubWebhook } from '@cloudcomponents/cdk-github-webhook';

export class GithubWebhookStack extends Stack {
  public constructor(parent: App, name: string, props?: StackProps) {
    super(parent, name, props);

    const api = new RestApi(this, 'github-webhook');
    api.root.addMethod('POST');

    const githubApiToken = process.env.API_TOKEN as string;

    // @example https://github.com/cloudcomponents/cdk-constructs
    const githubRepoUrl = process.env.REPO_URL as string;

    // @see https://developer.github.com/v3/activity/events/types/
    const events = ['*'];

    new GithubWebhook(this, 'GithubWebhook', {
      githubApiToken,
      githubRepoUrl,
      payloadUrl: api.url,
      events,
      logLevel: 'debug',
    });
  }
}
